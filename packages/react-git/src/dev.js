/**
 * @file `react-git dev` orchestration. Wraps `@lazarv/react-server`'s
 * programmatic dev server with our git-aware extraction loop:
 *
 *   1. Initial extract → manifest on disk under `<workdir>/.react-git/cache/`.
 *   2. Stage app + ensure `react-server.config.mjs` (same as build).
 *   3. Start the react-server dev server programmatically (HMR + RSC).
 *   4. Watch `.git/` for ref/HEAD/packed-refs changes; on debounced
 *      change, re-extract and ask Vite to full-reload connected clients.
 *
 * Dev does NOT touch react-server's static-export pipeline. The
 * `export: (paths) => paths` line in the synthesized config is inert at
 * dev — it only matters at `build` time.
 *
 * Why full-reload (not surgical HMR): the virtual `@level0x40/react-git/source`
 * module re-evaluates against fresh shards on every page render — its
 * `load()` hook reads from the manifest reader, which is stateless. So
 * once the manifest is rewritten on disk, the next request to any
 * route already sees fresh data. We just need the browser to navigate
 * back to the server, and a full-reload is the simplest correct thing.
 * A future refinement can invalidate only the route modules that
 * actually depend on the changed ref.
 */

import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { extractData } from "./build.js";
import { dur, kw, log, path as fmtPath, url } from "./log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the shipped baseline app inside this package.
 *  In the no-stage path we point react-server at this directory
 *  directly (via `reactServer(root, ...)`) so dev iteration on the
 *  package's own source files doesn't require a re-stage step. */
const PACKAGE_APP_DIR = path.resolve(__dirname, "../app");

/**
 * @typedef {object} DevOptions
 * @property {string} repo                    Path to the local Git repo (working tree or bare).
 * @property {readonly string[]} templates    Stack of absolute paths to active template directories, in CLI order (low → high priority — last entry wins). Pre-resolved at the CLI boundary by `resolveTemplates()` in cli.js — built-in name vs. user path resolution lives there, not here. Always non-empty; defaults to a single-entry stack pointing at the built-in `default` template when the user omits the flag.
 * @property {string} [workdir]               Working directory used for staging + manifest. Defaults to cwd.
 * @property {number} [maxCommits]            Cap for commits in the per-ref log shards.
 * @property {number} [maxBlobBytes]          Skip rendering blob bodies above this size.
 * @property {readonly string[]} [includeRef] Ref-name include patterns.
 * @property {readonly string[]} [excludeRef] Ref-name exclude patterns.
 * @property {boolean} [force]                Wipe the cache before the initial extract.
 * @property {number} [port]                  Dev-server port (default: react-server's default).
 * @property {string} [host]                  Dev-server host.
 * @property {boolean} [open]                 Open a browser on start.
 * @property {boolean} [https]                Enable HTTPS.
 * @property {boolean} [live]                 Skip extraction; data layer reads directly from git via GitAdapter at render time.
 * @property {Record<string, unknown>} [passthrough]
 *   Extra options forwarded verbatim to `@lazarv/react-server`'s `reactServer()` call. Populated by the CLI from any flag not consumed by react-git's own arg parser (e.g. `--cors`, `--devtools`, `--inspect`). Camel-cased to match the programmatic API.
 */

/** Debounce window for `.git/` events. Chosen to coalesce the burst of
 *  writes git emits during a single operation (a `git fetch` touches
 *  HEAD + refs/* + packed-refs in quick succession). 250ms is well
 *  under human-perceptible "did anything happen yet" latency but
 *  comfortably above the burst length for any normal git command. */
const REEXTRACT_DEBOUNCE_MS = 250;

/**
 * @param {DevOptions} options
 */
export async function runDev(options) {
  const repo = path.resolve(options.repo);
  // Already absolute — resolveTemplates() in cli.js handled built-in
  // name → path lookup before we got here. Re-resolving is a no-op
  // for absolute paths but keeps this defensive against external
  // callers that import runDev programmatically and pass relative.
  const templates = options.templates.map((t) => path.resolve(t));
  const live = options.live === true;

  // ── 1. Initial extract (manifest mode only) ───────────────────────────────
  // Live mode reads from git via GitAdapter at render time, so there's
  // no manifest to populate. The dev watcher below still runs in both
  // modes — in manifest mode it triggers re-extraction; in live mode
  // it just busts the data-layer cache and reloads the browser.
  let workdir;
  if (live) {
    workdir = path.resolve(options.workdir ?? process.cwd());
    log(`${kw("live")} mode — data layer reads git directly during render`);
  } else {
    ({ workdir } = await extractData(options));
  }

  // ── 2. Resolve app surface ────────────────────────────────────────────────
  //
  // ALWAYS run from the package's shipped `app/` directly — no copy,
  // no symlink, no staging. The user's optional `--template` stack is
  // applied via the template plugin registered inside
  // `app/react-server.config.mjs` (driven by the
  // `REACT_GIT_TEMPLATE_DIRS` env var we set below). That keeps the
  // override mechanism inside the config-merge layer where it
  // belongs, so the file-router (which re-loads the config in its
  // own `configResolved`) sees the merged result.
  const appRoot = PACKAGE_APP_DIR;

  // Set runtime env vars BEFORE reactServer starts so the config
  // file (loaded by react-server's `loadConfig` cwd scan after we
  // chdir below) and any request-path code see them.
  process.env.REACT_GIT_MODE = live ? "live" : "manifest";
  process.env.REACT_GIT_REPO = repo;
  if (!live) process.env.REACT_GIT_SOURCE_ROOT = workdir;
  // Always set — even the no-flag case resolves to a single-entry
  // stack pointing at the built-in `default` template upstream in
  // cli.js. The template plugin reads this env var (path.delimiter-
  // joined list) to find user-overrideable files. Order: CLI order
  // (low → high priority — last entry wins).
  process.env.REACT_GIT_TEMPLATE_DIRS = templates.join(path.delimiter);
  // Legacy single-template env var, kept in sync for any external
  // tooling that still reads it.
  process.env.REACT_GIT_TEMPLATE_DIR = templates[templates.length - 1];

  // initialConfig only carries the slots react-server's TOP-LEVEL
  // `loadConfig(initialConfig, options)` actually propagates.
  // Notably: file-router-related settings (e.g. `root: "src/pages"`)
  // do NOT propagate, because the file-router plugin re-loads its
  // config via a fresh `loadConfig({}, options)` inside its own
  // `configResolved` — those settings have to live in a real file
  // on disk, which is what `app/react-server.config.mjs` is.
  //
  // Vite passthrough DOES propagate. `cacheDir` lands under workdir
  // so the package tree never gets a `.vite/` written into it —
  // matters in pnpm strict installs where the package is hardlinked
  // to the global store.
  /** @type {Record<string, unknown> | undefined} */
  const initialConfig = {
    vite: {
      cacheDir: path.join(workdir, ".react-git", "vite"),
    },
  };

  // ── 3. Start react-server dev programmatically ────────────────────────────
  //
  // We do NOT call `server.listen()`. The public `reactServer()` API
  // sets up its runtime AsyncLocalStorage scope inside an internal
  // `runtime_init$` callback, then resolves the promise — meaning the
  // consumer awaiting that promise is OUTSIDE the ALS by definition.
  // The internal `.listen()` triggers Vite's `middlewares.listen` hook
  // chain (which is where the `live` plugin attaches via
  // `runtime$(LIVE_IO_CONTEXT, ...)`); without an active ALS store
  // that crashes with "Cannot set properties of null (setting
  // Symbol(LIVE_IO))".
  //
  // The right consumer pattern is to take `server.middlewares` (a
  // Connect handler) and mount it on our own http.Server — react-server
  // owns the request pipeline, we own the transport. This sidesteps
  // the leaky listen entirely and matches the documented purpose of
  // the `middlewares` field in `lib/dev/index.d.ts` ("use as a
  // middleware in a Node.js server"). HMR still works because
  // `server.ws` was already wired up inside the ALS callback.
  //
  // Cwd policy: chdir to `appRoot` in BOTH paths.
  //
  // The first arg to `reactServer(root, ...)` is interpreted by
  // `getModules` as a *module specifier*, not a directory — it tries
  // `__require.resolve(root, { paths: [cwd] })`, falling through to
  // `virtual:react-server-eval.jsx` (which throws "Root module not
  // provided") when resolution fails. Passing a directory path here
  // doesn't work; the supported way to use the file-router entry is
  // to pass `null` and let cwd point at the project. So chdir +
  // `null` root is the right shape.
  //
  // We do NOT call `server.listen()`. The public `reactServer()` API
  // sets up its runtime AsyncLocalStorage scope inside an internal
  // `runtime_init$` callback, then resolves the promise — meaning the
  // consumer awaiting that promise is OUTSIDE the ALS by definition.
  // The internal `.listen()` triggers Vite's `middlewares.listen` hook
  // chain (which is where the `live` plugin attaches via
  // `runtime$(LIVE_IO_CONTEXT, ...)`); without an active ALS store
  // that crashes with "Cannot set properties of null (setting
  // Symbol(LIVE_IO))".
  //
  // The right consumer pattern is to take `server.middlewares` (a
  // Connect handler) and mount it on our own http.Server — react-server
  // owns the request pipeline, we own the transport.
  process.chdir(appRoot);
  const { reactServer } = await loadReactServerDev();

  /** @type {Record<string, unknown>} */
  const cliOptions = { ...options.passthrough };
  if (options.host !== undefined) cliOptions.host = options.host;
  if (options.https) cliOptions.https = true;
  if (options.open) cliOptions.open = true;
  // Don't pass `port` to reactServer — it isn't going to listen.
  // Our orchestration owns the http.Server transport, so any port
  // forwarded via passthrough would be silently ignored. Strip it
  // here defensively so a user passing `--port 3001` doesn't get
  // confused by react-server claiming the port internally.
  delete cliOptions.port;

  const server = initialConfig
    ? await reactServer(/* root */ null, cliOptions, initialConfig)
    : await reactServer(/* root */ null, cliOptions);

  const port = options.port ?? 3000;
  const host = options.host ?? "localhost";
  const httpServer = http.createServer(server.middlewares);
  await new Promise((resolve) => httpServer.listen(port, host, resolve));
  log(`dev server listening on ${url(`http://${host}:${port}`)}`);

  // ── 4. Watch `.git/` for changes ──────────────────────────────────────────
  const gitDir = await resolveGitDir(repo);
  log(`watching ${fmtPath(gitDir)} for ref changes`);

  let pending = false;
  let inFlight = false;
  /** @type {NodeJS.Timeout | null} */
  let timer = null;

  const onChange = () => {
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(drain, REEXTRACT_DEBOUNCE_MS);
  };

  const drain = async () => {
    if (inFlight) return; // re-entry guard; if events arrive while we're
    // running, the trailing `pending` flag re-fires.
    if (!pending) return;
    pending = false;
    inFlight = true;
    const t0 = Date.now();
    try {
      if (live) {
        // Live mode has no manifest to refresh — but the data layer's
        // "use cache" wrappers DO have stale entries from before the
        // git change. Full-reload alone wouldn't bust them; we'd serve
        // the same cached blobs/refs. Best-effort invalidation: clear
        // the use-cache memory provider here. Falls back to noop if
        // the framework's invalidate API isn't reachable from this
        // context — full-reload still kicks the browser; the user can
        // hit Cmd-Shift-R to fully refresh module state.
        try {
          const rs = await import("@lazarv/react-server");
          if (typeof rs.invalidate === "function") {
            // No tags wired yet; rely on the cache profile's wholesale
            // clear. A future enhancement can tag entries by ref so
            // we only bust what changed.
            await rs.invalidate("react-git-data");
          }
        } catch {
          // Module unreachable from this context — accept the limitation.
        }
        log(`git changed; reloading clients (${kw("live")} mode, ${dur(Date.now() - t0)})`);
      } else {
        // Re-run the data pipeline. The cache layer in build.js skips
        // anything content-addressable that's already on disk, so a
        // single new commit re-extracts ~one ref's tree-index + a
        // commit shard + a diff shard — usually <100ms.
        await extractData({ ...options, force: false });
        log(`re-extracted in ${dur(Date.now() - t0)}; reloading clients`);
      }
      // Manifest mode: the reader is stateless; manifest re-write
      // already updated disk shards. Live mode: cache invalidation
      // above handled the stale-data problem. Either way, kick
      // connected browsers.
      server.ws.send({ type: "full-reload" });
    } catch (err) {
      log(`re-extract failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      inFlight = false;
      // If watcher events accumulated during the run, drain again.
      if (pending) timer = setTimeout(drain, REEXTRACT_DEBOUNCE_MS);
    }
  };

  // Node 22's recursive watch works cross-platform. We filter at the
  // event level: refs/HEAD/packed-refs only. `objects/` writes during
  // a `git gc` would otherwise dominate the event stream and trigger
  // pointless re-extracts.
  const watcher = fsSync.watch(gitDir, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    if (!shouldReactToGitChange(filename)) return;
    onChange();
  });

  // Clean shutdown: close watcher, http listener, and Vite dev server
  // on Ctrl-C so a re-run doesn't trip "address in use". Order matters
  // — close the http listener first to stop accepting new requests,
  // then tear down the Vite-side state.
  const shutdown = async () => {
    // Leading blank line so the timestamp doesn't sit next to the
    // ^C glyph the shell prints. Same readability tweak the previous
    // bare write had.
    process.stderr.write("\n");
    log("shutting down");
    try {
      watcher.close();
    } catch {}
    try {
      await new Promise((r) => httpServer.close(() => r(undefined)));
    } catch {}
    try {
      await server.close();
    } catch {}
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

/**
 * Decide whether a `.git/`-relative path should trigger a re-extract.
 * Allow: `HEAD`, `packed-refs`, anything under `refs/`. Deny: `objects/`,
 * `index` (working-tree state, not refs), `*.lock` (transient writes
 * git uses while assembling a real ref update — the trailing
 * non-`.lock` write is what we actually want to react to).
 *
 * @param {string} relativePath  posix-style path emitted by fs.watch
 * @returns {boolean}
 */
function shouldReactToGitChange(relativePath) {
  // Normalize Windows separators just in case.
  const p = relativePath.replace(/\\/g, "/");
  if (p.endsWith(".lock")) return false;
  if (p === "HEAD") return true;
  if (p === "packed-refs") return true;
  if (p.startsWith("refs/")) return true;
  return false;
}

/**
 * Resolve the on-disk git directory for a repo. For a working tree
 * that's `<repo>/.git`; for a bare repo, `<repo>` itself. We don't
 * support `.git` files (gitdir indirection, used by submodules and
 * worktrees) — that case can be added when someone asks for it.
 *
 * @param {string} repo
 * @returns {Promise<string>}
 */
async function resolveGitDir(repo) {
  const dotGit = path.join(repo, ".git");
  const stat = await fs.stat(dotGit).catch(() => null);
  if (stat?.isDirectory()) return dotGit;
  // Bare repo — gitDir is the repo itself.
  return repo;
}

async function loadReactServerDev() {
  try {
    return await import("@lazarv/react-server/dev");
  } catch (err) {
    throw new Error(
      "Cannot load @lazarv/react-server/dev. Reinstall the CLI dependencies " +
        "(this package depends on @lazarv/react-server directly). Original error: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}
