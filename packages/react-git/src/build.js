/**
 * @file `react-git build` orchestration. Phase 1 pipeline:
 *
 *   1. Resolve --repo to an absolute path; sniff bare vs working tree.
 *   2. Extract the source-graph via the Git adapter.
 *   3. Write a sharded JSON manifest under `<workdir>/.source/cache/`.
 *   4. Stage the shipped baseline app + overlay --template into
 *      `<workdir>/.source/app/`, ensure react-server.config.mjs exists.
 *   5. Invoke `@lazarv/react-server/build` programmatically against the
 *      staged dir; static export emits real .html files into --out.
 *
 * `<workdir>` defaults to the user's cwd. Putting both `cache/` and
 * `app/` under a single `.source/` dir keeps our footprint quarantined
 * and easy to clean.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { CliError } from "./errors.js";
import { dur, kw, log, name as fmtName, num, sha as fmtSha } from "./log.js";
import { GitAdapter } from "./git/adapter.js";
import { parseUnifiedDiff } from "./git/diff-parser.js";
import { highlightBlob, highlightDiffLine, disposeHighlighter } from "./highlight.js";
import { manifestPaths } from "./manifest/layout.js";
import { createManifestWriter } from "./manifest/write.js";
import { setSourceRoot } from "./runtime/source-build.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the package's own root (where `node_modules/` lives
 *  in either workspace-member or installed-as-dep mode). Used as the
 *  anchor for build-time scratch directories so that scratch state
 *  doesn't pollute the published-source `app/` subtree (which would
 *  otherwise trip pnpm pack on Vite cache symlinks). */
const PACKAGE_DIR = path.resolve(__dirname, "..");

/** Absolute path to the shipped baseline app inside this package. The
 *  no-stage build path uses this directly as cwd so the static
 *  `app/react-server.config.mjs` is picked up by react-server's
 *  `loadConfig` cwd scan, and Vite reads source files from here. */
const PACKAGE_APP_DIR = path.join(PACKAGE_DIR, "app");

/**
 * @typedef {object} BuildOptions
 * @property {string} repo                    Path to the local Git repo (working tree or bare).
 * @property {string} out                     Output directory for static HTML/assets.
 * @property {readonly string[]} templates    Stack of absolute paths to active template directories, in CLI order (low → high priority — last entry wins). Pre-resolved at the CLI boundary by `resolveTemplates()` in cli.js — built-in name vs. user path resolution lives there, not here. Always non-empty; defaults to a single-entry stack pointing at the built-in `default` template when the user omits the flag.
 * @property {string} [workdir]               Working directory used for staging + manifest. Defaults to cwd.
 * @property {number} [maxCommits]            Cap for commits in the per-ref log shards.
 * @property {number} [maxBlobBytes]          Skip rendering blob bodies above this size (default 512 KiB).
 * @property {readonly string[]} [includeRef] Patterns (with `*` wildcard) that ref short-names must match to be extracted.
 * @property {readonly string[]} [excludeRef] Patterns to exclude even if they matched include.
 * @property {boolean} [force]                Wipe the cache before building (otherwise extraction is incremental).
 * @property {boolean} [live]                 Skip extraction; data layer reads directly from git via GitAdapter at render time.
 * @property {Record<string, unknown>} [passthrough]
 *   Extra options forwarded verbatim to `@lazarv/react-server`'s `build()` call. Populated by the CLI from any flag not consumed by react-git's own arg parser (e.g. `--deploy`, `--silent`, `--adapter <name>`). Camel-cased to match the programmatic API.
 */

/** Bumped any time a manifest shard's on-disk shape changes. Mismatch → cache wipe. */
const CACHE_SCHEMA_VERSION = 1;

/** Bytes scanned for binary detection — if a NUL appears here, treat as binary. */
const BINARY_SNIFF_BYTES = 8192;

/**
 * Run the data-extraction half of the pipeline: load the cache, walk
 * git, write the manifest, and make the manifest discoverable to the
 * staged app. Pure-data; no Vite, no react-server. Shared between
 * `react-git build` (one-shot) and `react-git dev` (re-runs on every
 * `.git/` change).
 *
 * Returns the resolved `workdir` so callers don't have to repeat the
 * `path.resolve` / cwd-fallback dance.
 *
 * @param {BuildOptions} options
 * @returns {Promise<{ workdir: string }>}
 */
export async function extractData(options) {
  const workdir = path.resolve(options.workdir ?? process.cwd());
  const repo = path.resolve(options.repo);
  const maxCommits = options.maxCommits ?? 50;
  const maxBlobBytes = options.maxBlobBytes ?? 512 * 1024;

  await assertGitRepo(repo);

  // Load the on-disk cache state. Everything content-addressable
  // (blobs, commits, diffs) is keyed by SHA, so a shard from a prior
  // build is correct forever. Per-ref work (tree shards) only repeats
  // for refs whose tip moved.
  const cache = await loadCacheState(workdir, options.force === true);

  // ── 1+2+3. Extract & write manifest ─────────────────────────────────────
  const adapter = new GitAdapter({ repo });
  const writer = await createManifestWriter(workdir);

  const repoName = path.basename(repo.replace(/\.git$/, ""));
  // Calendar window: 53 weeks ending today. Aligns with
  // `listCommitCalendar` in the runtime — a column per week, rightmost
  // is the current week. Computed here so the extracted shard exactly
  // matches what the page will query.
  //
  // Padded with `weekday` extra days so the window starts on a Sunday
  // and `git log --since` doesn't drop commits the runtime wouldn't
  // also drop.
  const calendarStart = new Date();
  calendarStart.setUTCHours(0, 0, 0, 0);
  calendarStart.setUTCDate(calendarStart.getUTCDate() - calendarStart.getUTCDay() - 52 * 7);
  const [project, refs, commits, calendarDates] = await Promise.all([
    adapter.resolveProject(repoName),
    adapter.listRefs(),
    adapter.listCommits({ limit: maxCommits }),
    // Independent of `--max-commits`: walks `--all` so commits on side
    // branches still light up the calendar, and `--since` bounds the
    // fan-out to the visible window. Cheap — one date per commit, no
    // per-commit shard reads at calendar render time.
    adapter.listCommitDates({ since: calendarStart }),
  ]);

  // The header shards (project / refs / commit-index / calendar-dates)
  // are tiny and always refreshed — they're how we tell the cache
  // system "this build was here". The per-commit shard fan-out is gated
  // by the cache so we skip ones that already exist on disk.
  await Promise.all([
    writer.writeProject(project),
    writer.writeRefs(refs),
    writer.writeCommitIndex(commits.map((c) => c.sha)),
    writer.writeCommitCalendarDates(calendarDates),
    Promise.all(
      commits.filter((c) => !cache.commitShas.has(c.sha)).map((c) => writer.writeCommit(c)),
    ),
  ]);

  // Filter the ref set we'll deeply extract. Default: all branches AND
  // tags. `--exclude-ref` wins ties — useful for keeping `wip/*` out
  // of the artifact even when `--include-ref *` is set.
  const refsToExtract = filterRefs(refs, options.includeRef, options.excludeRef);
  log(
    `extracting ${num(refsToExtract.length)}/${num(refs.length)} refs ` +
      `(${num(refsToExtract.filter((r) => r.kind === "branch").length)} branches, ` +
      `${num(refsToExtract.filter((r) => r.kind === "tag").length)} tags)`,
  );

  try {
    // ── Phase 5: per-ref tree + blob extraction ───────────────────────────
    // One BatchReader for the whole pass, one shared seen-set so the same
    // blob SHA never round-trips git twice even if it's reachable from
    // many refs (a common case: HEAD's history shares blobs with every
    // ancestor tag).
    await extractAllRefs(adapter, writer, refsToExtract, maxBlobBytes, cache);

    // ── Phase 5: per-ref commit logs ──────────────────────────────────────
    // Each ref gets its own commit-index shard. Commit shards themselves
    // are deduped across refs by SHA, so the disk cost is bounded by the
    // number of *unique* commits, not refs × maxCommits.
    const allCommitsBySha = await extractPerRefCommits(
      adapter,
      writer,
      refsToExtract,
      maxCommits,
      commits,
      cache,
    );

    // ── Phase 3: per-commit diffs (now over the union of all refs) ────────
    await extractDiffs(adapter, writer, [...allCommitsBySha.values()], cache);
  } finally {
    // Free the Shiki highlighter (loaded lazily during blob/diff
    // extraction). For build, this is before we hand the process to
    // react-server's static export; for dev, it's between watcher
    // ticks. Grammars + themes carry tens of MB we don't need to hold.
    await disposeHighlighter();
  }

  // Make the manifest visible to .static.{js,ts} files and config
  // callbacks running in this same Node process (no IPC boundary).
  setSourceRoot(workdir);
  process.env.REACT_GIT_SOURCE_ROOT = workdir;

  return { workdir };
}

/**
 * @param {BuildOptions} options
 */
export async function buildSite(options) {
  const out = path.resolve(options.out);
  // Already absolute — resolveTemplates() in cli.js handled built-in
  // name → path lookup before we got here. See the dev.js mirror
  // comment for why we re-resolve defensively.
  const templates = options.templates.map((t) => path.resolve(t));
  const live = options.live === true;

  // Live mode short-circuits extraction. The staged app's data layer
  // will hit `GitAdapter` directly via `runtime/live-impl.js` during
  // SSG render, with results memoized by react-server's "use cache"
  // wrappers in `runtime/source-build.js`.
  let workdir;
  if (live) {
    workdir = path.resolve(options.workdir ?? process.cwd());
    log(`${kw("live")} mode — skipping extraction, data layer reads git directly during SSG`);
  } else {
    ({ workdir } = await extractData(options));
  }

  const repo = path.resolve(options.repo);

  // ── 4. Resolve app surface ──────────────────────────────────────────────
  //
  // ALWAYS run from the package's shipped `app/` directly — no copy,
  // no symlink, no staging. The user's optional `--template` stack is
  // applied via the template plugin registered inside
  // `app/react-server.config.mjs` (driven by the
  // `REACT_GIT_TEMPLATE_DIRS` env var we set below). That keeps the
  // override mechanism inside the config-merge layer where it
  // belongs, so anything that re-loads config (the file-router, etc.)
  // sees the merged result.
  //
  // Output-dir trick: react-server's `build()` joins `outDir` with
  // cwd internally (`join(cwd, outDir)`) and refuses absolute paths.
  // We work around it by passing a *relative* outDir from
  // PACKAGE_APP_DIR up and over to the workdir artifacts dir — the
  // resulting `..`-laden path resolves correctly when joined.
  const appDir = PACKAGE_APP_DIR;
  process.env.REACT_GIT_MODE = live ? "live" : "manifest";
  process.env.REACT_GIT_REPO = repo;
  if (!live) process.env.REACT_GIT_SOURCE_ROOT = workdir;
  // Always set — even the no-flag case resolves to a single-entry
  // stack pointing at the built-in `default` template upstream in
  // cli.js. The template plugin reads this env var (path.delimiter-
  // joined list). Order: CLI order (low → high priority — last
  // entry wins).
  process.env.REACT_GIT_TEMPLATE_DIRS = templates.join(path.delimiter);
  // Legacy single-template env var, kept in sync for any external
  // tooling that still reads it.
  process.env.REACT_GIT_TEMPLATE_DIR = templates[templates.length - 1];
  // Build artifacts must live inside the package's tree, not under the
  // user's workdir. react-server's build externalises `@lazarv/react-server`
  // (and friends) from the server bundle: at static-export time, the
  // emitted bundle file at `<artifactsDir>/server/...mjs` does
  // `import "@lazarv/react-server"`, and Node resolves that by climbing
  // parents from the bundle path looking for `node_modules`.
  //
  // If artifacts were under `<workdir>/.react-git/build/`, the climb
  // ends at the user's cwd — which in a pnpm workspace where this CLI
  // is a workspace package may not have `@lazarv/react-server` in its
  // root `node_modules`.
  //
  // We anchor the artifacts at PACKAGE_DIR (sibling of `app/`), NOT
  // inside `app/` — the published `files: ["app", ...]` allowlist
  // would otherwise sweep up Vite's cache + the build scratch tree
  // every time someone packed, and pnpm pack chokes on the broken
  // symlinks Vite leaves in its cache. Sibling location keeps
  // node_modules resolution working (climb still lands in PACKAGE_DIR)
  // while keeping the dirty state out of the publishable surface.
  //
  // Manifest cache stays under the user's workdir (extraction is
  // per-repo and that's the right anchor for it). Only the bundler
  // intermediate moves here.
  const buildArtifactsDir = path.join(PACKAGE_DIR, ".react-git", "build");
  const staticExportDir = path.join(buildArtifactsDir, "dist");
  if (options.force === true) {
    // `--force`: clean slate. Extraction cache was already wiped
    // above; match it on the artifact side so a stuck file from a
    // previous interrupted build can't survive.
    await fs.rm(buildArtifactsDir, { recursive: true, force: true });
  }
  await fs.mkdir(buildArtifactsDir, { recursive: true });
  const internalOutDir = path.relative(PACKAGE_APP_DIR, buildArtifactsDir);

  // ── Incremental: stash previous build's artifacts aside ──────────────
  //
  // react-server's `build()` action (lib/build/action.mjs) wipes
  // `<cwd>/<outDir>` recursively at the start of every run. If we
  // leave the previous build in place, that wipe deletes the very
  // HTML we'd want to skip-over.
  //
  // Workaround: before invoking `build()`, rename the previous
  // artifacts dir to a sibling `.prev`. react-server then runs against
  // a fresh outDir; its wipe finds nothing to delete; the static
  // enumerators check the `.prev` location (via `REACT_GIT_BUILD_OUT`)
  // and skip routes already emitted there. After the build, we
  // merge any non-overwritten files from `.prev` back into the
  // active dir — that brings forward both:
  //
  //   - HTML for skipped routes (`.prev/dist/<route>/index.html` that
  //     the new build never touched because the enumerator excluded
  //     it), and
  //   - asset bundles those skipped HTML pages reference by hashed
  //     filename (`.prev/assets/abc-d4f.js`), which the new build's
  //     fresh hashes don't include.
  //
  // The merge is "fill gaps, never overwrite" — anything the new
  // build wrote wins; only entries the new build didn't produce get
  // backfilled from the previous. Same-named asset hashes are
  // identical content (Vite's hash IS the content hash), so the
  // never-overwrite rule is content-safe.
  //
  // `--force` skips this dance entirely: the wipe above already
  // erased `.prev`, the enumerator filter is bypassed via
  // `REACT_GIT_FORCE_REBUILD=1`, and react-server's own wipe
  // produces a clean tree.
  const prevArtifactsDir = `${buildArtifactsDir}.prev`;
  let hasPrev = false;
  if (options.force !== true && (await pathExists(staticExportDir))) {
    // Drop any stranded `.prev` from a previous interrupted run.
    await fs.rm(prevArtifactsDir, { recursive: true, force: true });
    await fs.rename(buildArtifactsDir, prevArtifactsDir);
    await fs.mkdir(buildArtifactsDir, { recursive: true });
    hasPrev = true;
  }

  // Plumb the incremental-export contract to the static enumerators
  // running inside react-server's `build()` call. Same process →
  // same env. `BUILD_OUT` points at the *previous* dist (now under
  // `.prev/`) — that's what the file-existence check reads, so a
  // route emitted last build is recognized even after react-server
  // wipes the active outDir. `FORCE_REBUILD` bypasses the filter
  // entirely, matching `--force`'s semantics on the extraction cache.
  if (hasPrev) {
    process.env.REACT_GIT_BUILD_OUT = path.join(prevArtifactsDir, "dist");
  } else {
    delete process.env.REACT_GIT_BUILD_OUT;
  }
  if (options.force === true) {
    process.env.REACT_GIT_FORCE_REBUILD = "1";
  } else {
    delete process.env.REACT_GIT_FORCE_REBUILD;
  }

  // ── 5. Invoke react-server build programmatically ───────────────────────
  //
  // CRITICAL ORDERING: react-server's build module captures `cwd` at
  // module-load time (`lib/build/server.mjs` line ~82: `const cwd =
  // sys.cwd()`). We MUST chdir into the app dir BEFORE the dynamic
  // import — otherwise the resolver looks up the file-router entry
  // from the wrong cwd. The `finally` restores the original cwd.
  //
  // The first arg to `build()` is the entry-point module specifier.
  // For file-router mode pass `null` — react-server falls back to
  // its internal `@lazarv/react-server/file-router` entry, resolved
  // from the (now chdir'd) cwd.
  const previousCwd = process.cwd();
  process.chdir(appDir);
  try {
    const { build } = await loadReactServerBuild();
    // Order matters: spread passthrough first so our own outDir
    // wins. Anything the user passed (e.g. --deploy, --silent,
    // --adapter <name>) flows in here verbatim. If they passed
    // their own --outDir, we still override — the orchestration
    // contract above (build artifacts + .prev incremental dance
    // + final cp to --out) hard-depends on outDir landing in our
    // workdir tree, not wherever the user pointed.
    await build(null, { ...options.passthrough, outDir: internalOutDir });
  } finally {
    process.chdir(previousCwd);
  }

  // ── Incremental: backfill skipped routes + their hashed assets ─────
  //
  // react-server only wrote files for routes the static enumerators
  // returned. Routes the enumerator skipped (because they already
  // existed in `.prev/dist/`) have no HTML in the current `dist/`.
  // Walk `.prev/` and copy anything missing — HTML, RSC payloads,
  // gzip/brotli compressed variants, prerender-cache JSON, and the
  // hashed asset bundles those skipped HTML pages reference.
  //
  // Never overwrite: anything the new build wrote wins. For asset
  // hashes that ARE in both directories, the contents are identical
  // (Vite's hash IS the content hash, so collision implies match), so
  // the never-overwrite rule is content-safe; we just skip the
  // redundant copy.
  if (hasPrev) {
    await mergeKept(prevArtifactsDir, buildArtifactsDir);
    await fs.rm(prevArtifactsDir, { recursive: true, force: true });
  }

  // Assemble the static-deployable artifact at --out by stitching three
  // pieces of the react-server build tree together. The HTML inside
  // `dist/index.html` references absolute URLs like `/assets/foo.css`
  // and `/client/bar.mjs`; for a static server those paths must resolve
  // at the deployment root, so we lift `dist/` contents up and place
  // `assets/` + `client/` alongside.
  //
  //   <appDir>/.react-server/
  //   ├── dist/        ← pre-rendered HTML + RSC payloads (.html, .gz, .br, rsc.x-component)
  //   ├── assets/      ← CSS, fonts, images (referenced as /assets/...)
  //   ├── client/      ← browser JS bundles (referenced as /client/...)
  //   ├── server/      ← server bundles, only needed for adapter SSR (skipped here)
  //   └── static/      ← compiled .static.{json,ts} loaders (build-time only)
  //
  // We skip `server/` and `static/` because static deployment serves
  // pre-rendered HTML directly. Adapter-driven deploys (Phase 6+) will
  // need a different artifact-assembly path.
  await fs.mkdir(out, { recursive: true });
  await fs.cp(staticExportDir, out, { recursive: true, force: true });
  for (const dir of ["assets", "client"]) {
    const src = path.join(buildArtifactsDir, dir);
    if (await exists(src)) {
      await fs.cp(src, path.join(out, dir), {
        recursive: true,
        force: true,
      });
    }
  }
}

/** @param {string} repo */
async function assertGitRepo(repo) {
  const stat = await fs.stat(repo).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new CliError(`--repo path does not exist or is not a directory: ${repo}`, {
      exitCode: 2,
    });
  }
  // Either a working tree (.git/ subdir) or a bare repo (HEAD file at root).
  const hasGitDir = await exists(path.join(repo, ".git"));
  const hasHead = await exists(path.join(repo, "HEAD"));
  if (!hasGitDir && !hasHead) {
    throw new CliError(
      `--repo path does not look like a Git repository (no .git/ subdir, no HEAD file): ${repo}`,
      { exitCode: 2 },
    );
  }
}

/** @param {string} p */
async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Snapshot of what the cache already contains, so the extractors can
 * skip work that's already on disk. All sets are SHA strings; the
 * `prevRefs` snapshot drives per-ref tree-extraction skips.
 *
 * @typedef {object} CacheState
 * @property {readonly import("./git/types.js").SourceRef[] | null} prevRefs
 *   Last build's refs.json, or null on cold/wiped cache.
 * @property {Set<string>} blobShas      SHA set found in `blobs/`
 * @property {Set<string>} commitShas    SHA set found in `commits/` (excluding the index shard)
 * @property {Set<string>} diffShas      SHA set found in `diffs/`
 */

/**
 * @param {string} workdir
 * @param {boolean} force  if true, wipe the cache before loading (returns empty state)
 * @returns {Promise<CacheState>}
 */
async function loadCacheState(workdir, force) {
  const paths = manifestPaths(workdir);
  if (force) {
    log(`${kw("--force")}: wiping cache`);
    await fs.rm(paths.root, { recursive: true, force: true });
    return { prevRefs: null, blobShas: new Set(), commitShas: new Set(), diffShas: new Set() };
  }

  const prevProject = await readJsonOrNull(paths.project);
  if (prevProject && prevProject.schemaVersion !== CACHE_SCHEMA_VERSION) {
    log(
      `cache schema mismatch (have ${num(prevProject.schemaVersion)}, want ${num(CACHE_SCHEMA_VERSION)}) — wiping`,
    );
    await fs.rm(paths.root, { recursive: true, force: true });
    return { prevRefs: null, blobShas: new Set(), commitShas: new Set(), diffShas: new Set() };
  }

  const [prevRefs, blobShas, commitShas, diffShas] = await Promise.all([
    readJsonOrNull(paths.refs),
    listShardShas(path.join(paths.root, "blobs")),
    listShardShas(paths.commitsDir),
    listShardShas(path.join(paths.root, "diffs")),
  ]);

  if (prevProject) {
    log(
      `cache: ${num(blobShas.size)} blobs, ${num(commitShas.size)} commits, ${num(diffShas.size)} diffs from previous build`,
    );
  }

  return { prevRefs, blobShas, commitShas, diffShas };
}

/**
 * Cheap directory scan → Set of SHA strings (filenames minus `.json`).
 * Used to populate cache-skip sets for content-addressable shard dirs.
 * Tolerates a missing dir (cold cache) by returning empty.
 *
 * @param {string} dir
 * @returns {Promise<Set<string>>}
 */
async function listShardShas(dir) {
  try {
    const files = await fs.readdir(dir);
    const set = new Set();
    for (const f of files) {
      if (f.endsWith(".json") && f !== "index.json") {
        set.add(f.slice(0, -".json".length));
      }
    }
    return set;
  } catch {
    return new Set();
  }
}

/** @param {string} filePath */
async function readJsonOrNull(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

/** @param {string} p */
async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively copy entries from `src` into `dst` that don't already
 * exist in `dst`. Existing files in `dst` are NEVER overwritten — the
 * fresh build wins, the previous build only fills gaps.
 *
 * Used by the incremental-build flow to backfill HTML for routes the
 * static enumerator skipped, plus the hashed asset bundles those
 * pages reference (which the new build wouldn't include in its own
 * fresh asset graph).
 *
 * @param {string} src
 * @param {string} dst
 */
async function mergeKept(src, dst) {
  const entries = await fs.readdir(src, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(src, entry.name);
      const dstPath = path.join(dst, entry.name);
      if (entry.isDirectory()) {
        // Always recurse: even if the dst dir already exists, files
        // INSIDE may be missing. mkdir is idempotent with recursive.
        await fs.mkdir(dstPath, { recursive: true });
        await mergeKept(srcPath, dstPath);
        return;
      }
      // Skip if dst already has this file — never overwrite.
      if (await pathExists(dstPath)) return;
      // Symlinks and other non-regular files: pass-through via cp,
      // which preserves the type. fs.copyFile would dereference.
      await fs.cp(srcPath, dstPath, { force: false });
    }),
  );
}

/**
 * Match `slugifyRef` from `manifest/layout.js`. Duplicated here only
 * because we need slug derivation for a path-existence check before
 * the ManifestWriter API is involved. If layout.js's slug rules ever
 * change, update both.
 *
 * @param {string} ref
 */
function slugifyRefForCache(ref) {
  return ref.replace(/_/g, "__").replace(/\//g, "_");
}

/**
 * Multi-ref extraction. Iterates the filtered ref set, writing per-ref
 * tree shards and a single `_index.json` resolver per ref. Blob shards
 * are deduplicated globally by SHA — opening one batch reader for the
 * whole pass amortizes the `git cat-file --batch` startup cost across
 * all refs.
 *
 * @param {import("./git/adapter.js").GitAdapter} adapter
 * @param {import("./manifest/write.js").ManifestWriter} writer
 * @param {readonly import("./git/types.js").SourceRef[]} refs
 * @param {number} maxBlobBytes
 * @param {CacheState} cache
 */
async function extractAllRefs(adapter, writer, refs, maxBlobBytes, cache) {
  // Seed with cached blob SHAs so we skip cat-file reads for content
  // that's already shard-on-disk from a previous build.
  const seenBlobs = new Set(cache.blobShas);
  const reader = adapter.openBatchReader();
  try {
    for (const ref of refs) {
      await extractOneRef(adapter, writer, reader, ref, maxBlobBytes, seenBlobs, cache);
    }
  } finally {
    await reader.close();
  }
}

/**
 * @param {import("./git/adapter.js").GitAdapter} adapter
 * @param {import("./manifest/write.js").ManifestWriter} writer
 * @param {import("./git/adapter.js").BlobBatchReader} reader
 * @param {import("./git/types.js").SourceRef} ref
 * @param {number} maxBlobBytes
 * @param {Set<string>} seenBlobs
 * @param {CacheState} cache
 */
async function extractOneRef(adapter, writer, reader, ref, maxBlobBytes, seenBlobs, cache) {
  // Fast path: ref tip is unchanged AND its tree-index shard is on
  // disk (the last write of the per-ref tree extraction, so its
  // presence proves the previous extraction completed). Skip ls-tree,
  // skip writes, skip blob iteration. Blobs reachable from this ref
  // are already shard-on-disk and stay in `seenBlobs` via the cache
  // seed so other refs don't re-read them either.
  const prevRef = cache.prevRefs?.find((r) => r.shortName === ref.shortName);
  if (prevRef && prevRef.sha === ref.sha) {
    const indexPath = path.join(
      writer.root,
      "trees",
      slugifyRefForCache(ref.shortName),
      "_index.json",
    );
    if (await pathExists(indexPath)) {
      log(`ref ${fmtName(ref.shortName)} unchanged → ${kw("skip")}`);
      return;
    }
  }

  const t0 = Date.now();
  log(`ref ${fmtName(ref.shortName)} (${fmtSha(ref.sha.slice(0, 8))})…`);
  const allEntries = await adapter.listAllEntries(ref.sha);
  log(`  ${num(allEntries.length)} entries in ${dur(Date.now() - t0)}`);

  // 1. Build the path-resolver index: every blob + every synthesized
  //    tree, keyed by repo-root-relative path. The empty string is the
  //    root tree — added explicitly because ls-tree -r omits it.
  //    Submodules (kind="commit") are intentionally NOT indexed: we
  //    don't traverse into them, so deep-linking a submodule path 404s
  //    rather than 500s on a missing blob shard. They still appear in
  //    parent tree listings via FileBrowser's submodule render path.
  /** @type {import("./manifest/write.js").TreeIndex} */
  const index = {
    "": { kind: "tree", sha: "", size: -1 },
  };
  for (const entry of allEntries) {
    if (entry.kind === "commit") continue;
    index[entry.path] = {
      kind: entry.kind,
      sha: entry.sha,
      size: entry.size,
    };
  }

  // 2. Group entries by parent directory so each tree shard can be
  //    written in a single pass. Trees themselves are NOT included as
  //    their own children; only blobs/subtrees that sit directly inside.
  /** @type {Map<string, import("./git/types.js").SourceTreeEntry[]>} */
  const childrenByParent = new Map();
  childrenByParent.set("", []);
  for (const entry of allEntries) {
    const slash = entry.path.lastIndexOf("/");
    const parent = slash < 0 ? "" : entry.path.slice(0, slash);
    if (!childrenByParent.has(parent)) {
      childrenByParent.set(parent, []);
    }
    childrenByParent.get(parent).push(entry);
  }

  // 3. Write tree shards. Sort children name-asc within each tree for a
  //    deterministic on-disk order — makes diffs of `.react-git/cache/`
  //    between builds readable.
  const treeWrites = [];
  for (const [treePath, children] of childrenByParent) {
    children.sort((a, b) => a.name.localeCompare(b.name));
    treeWrites.push(
      writer.writeTree({
        ref: ref.shortName,
        path: treePath,
        entries: children,
      }),
    );
  }
  const t1 = Date.now();
  await Promise.all(treeWrites);
  log(`  ${num(treeWrites.length)} tree shards in ${dur(Date.now() - t1)}`);

  // 4. Write the resolver index. Pages query this once and use it to
  //    decide between fetching a tree shard or a blob shard.
  await writer.writeTreeIndex(ref.shortName, index);

  // 5. Read + write blob bodies through the SHARED batch reader. The
  //    `seenBlobs` set spans the whole multi-ref pass, so a blob that
  //    appears in main + a feature branch + three tags only round-trips
  //    git once.
  /** @type {import("./git/types.js").SourceTreeEntry[]} */
  const blobsToRead = [];
  for (const entry of allEntries) {
    if (entry.kind !== "blob") continue;
    if (seenBlobs.has(entry.sha)) continue;
    seenBlobs.add(entry.sha);
    blobsToRead.push(entry);
  }

  const t2 = Date.now();
  log(`  reading ${num(blobsToRead.length)} new blobs (cat-file --batch)…`);

  let done = 0;
  const total = blobsToRead.length;
  // Sequential read on the batch — the underlying subprocess is
  // already pipelined internally. Adding JS-side concurrency on top
  // would just queue requests faster than the writer drains them
  // without speeding anything up.
  for (const entry of blobsToRead) {
    await extractBlob(reader, writer, ref.shortName, entry, maxBlobBytes);
    done++;
    if (done > 0 && (done % 250 === 0 || done === total)) {
      log(`    ${num(done)}/${num(total)} (${dur(Date.now() - t2)})`);
    }
  }
}

/**
 * Read one blob, classify it (binary / oversize / text), write the shard.
 *
 * @param {import("./git/adapter.js").BlobBatchReader} reader
 * @param {import("./manifest/write.js").ManifestWriter} writer
 * @param {string} ref
 * @param {import("./git/types.js").SourceTreeEntry} entry
 * @param {number} maxBlobBytes
 */
async function extractBlob(reader, writer, ref, entry, maxBlobBytes) {
  /** @type {import("./git/types.js").SourceFile} */
  const base = {
    ref,
    path: entry.path,
    sha: entry.sha,
    size: entry.size,
    binary: false,
    language: detectLanguage(entry.path),
    content: null,
    html: null,
  };

  // Skip body read for oversized files. The page can still render a
  // header (size, path, "too large to inline") from the index entry +
  // detected language. Dropping the bytes keeps the manifest small.
  if (entry.size > maxBlobBytes) {
    await writer.writeBlob({ ...base, binary: false, content: null });
    return;
  }

  const bytes = await reader.read(entry.sha);
  if (!bytes) {
    // Stale ls-tree row referencing an object that vanished mid-build.
    // Record an empty-content shard so the page can still render.
    await writer.writeBlob(base);
    return;
  }

  // Binary sniff: a NUL byte in the first 8 KiB is the conventional
  // signal that a blob isn't human-readable text. Mirrors what `git
  // diff` and most editors do.
  const sniffEnd = Math.min(bytes.length, BINARY_SNIFF_BYTES);
  let isBinary = false;
  for (let i = 0; i < sniffEnd; i++) {
    if (bytes[i] === 0) {
      isBinary = true;
      break;
    }
  }

  if (isBinary) {
    await writer.writeBlob({ ...base, binary: true, content: null });
    return;
  }

  const content = bytes.toString("utf8");
  // highlightBlob returns null for unsupported languages, oversized
  // input that Shiki itself rejects, or any internal failure. The
  // BlobView component falls back to plain `<pre>{content}</pre>` in
  // that case, so we never block the build on highlighter errors.
  const html = await highlightBlob(content, base.language);
  await writer.writeBlob({ ...base, content, html });
}

/**
 * Cheap language tag from extension. Real syntax highlighting (Phase 4)
 * will use Shiki + finer detection; for now this is just a hint stored
 * alongside the blob so route components can label files.
 *
 * @param {string} filePath
 * @returns {string | null}
 */
function detectLanguage(filePath) {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0 || dot === filePath.length - 1) return null;
  const ext = filePath.slice(dot + 1).toLowerCase();
  // Conservative allowlist; unknowns return null and the page falls
  // back to plain monospaced text.
  const known = new Set([
    "js",
    "jsx",
    "ts",
    "tsx",
    "mjs",
    "cjs",
    "mts",
    "cts",
    "json",
    "md",
    "mdx",
    "css",
    "scss",
    "sass",
    "less",
    "html",
    "xml",
    "svg",
    "yml",
    "yaml",
    "toml",
    "py",
    "rb",
    "go",
    "rs",
    "java",
    "kt",
    "swift",
    "c",
    "h",
    "cpp",
    "hpp",
    "sh",
    "bash",
    "zsh",
    "fish",
    "sql",
  ]);
  return known.has(ext) ? ext : null;
}

/**
 * Per-ref commit log extraction. For each ref, run `git log --max-count=N <ref>`
 * and write a `commits/by-ref/<ref-slug>.json` SHA index. Commit shards
 * (`commits/<sha>.json`) are deduplicated globally by SHA AND by the
 * incremental cache — same commit reachable from main + a tag + a
 * release branch + a previous build only writes once total.
 *
 * Returns the union of all unique commits across refs (plus the seed
 * `headCommits` already pulled by the caller for `commits/index.json`)
 * so the caller can run diff extraction without a second log pass.
 *
 * @param {import("./git/adapter.js").GitAdapter} adapter
 * @param {import("./manifest/write.js").ManifestWriter} writer
 * @param {readonly import("./git/types.js").SourceRef[]} refs
 * @param {number} maxCommits
 * @param {readonly import("./git/types.js").SourceCommit[]} headCommits
 * @param {CacheState} cache
 * @returns {Promise<Map<string, import("./git/types.js").SourceCommit>>}
 */
async function extractPerRefCommits(adapter, writer, refs, maxCommits, headCommits, cache) {
  /** @type {Map<string, import("./git/types.js").SourceCommit>} */
  const bySha = new Map();
  for (const c of headCommits) bySha.set(c.sha, c);

  const t0 = Date.now();
  let newShards = 0;
  log("per-ref commit logs…");

  for (const ref of refs) {
    // If the ref is unchanged AND its by-ref index is on disk, skip
    // the log call entirely. Same completeness argument as the tree
    // skip: the index file is the LAST write per ref, so its presence
    // proves the prior log was fully captured.
    const prevRef = cache.prevRefs?.find((r) => r.shortName === ref.shortName);
    if (prevRef && prevRef.sha === ref.sha) {
      const idxPath = path.join(
        writer.root,
        "commits/by-ref",
        `${slugifyRefForCache(ref.shortName)}.json`,
      );
      if (await pathExists(idxPath)) continue;
    }

    const log = await adapter.listCommits({ ref: ref.shortName, limit: maxCommits });
    /** @type {Promise<void>[]} */
    const shardWrites = [];
    for (const c of log) {
      bySha.set(c.sha, c); // populate map even if shard exists — diff pass needs it
      if (!cache.commitShas.has(c.sha)) {
        cache.commitShas.add(c.sha); // mark seen so two refs don't both write
        shardWrites.push(writer.writeCommit(c));
        newShards++;
      }
    }
    shardWrites.push(
      writer.writeCommitIndexByRef(
        ref.shortName,
        log.map((c) => c.sha),
      ),
    );
    await Promise.all(shardWrites);
  }

  log(
    `  ${num(bySha.size)} unique commits seen, ${num(newShards)} new shards written (${dur(Date.now() - t0)})`,
  );
  return bySha;
}

/**
 * Filter a ref list using `--include-ref` / `--exclude-ref` patterns.
 * Patterns support `*` as a single wildcard (no `**`, no `?`); empty
 * include = include-all. `exclude` always wins.
 *
 * @param {readonly import("./git/types.js").SourceRef[]} refs
 * @param {readonly string[]} [include]
 * @param {readonly string[]} [exclude]
 * @returns {import("./git/types.js").SourceRef[]}
 */
function filterRefs(refs, include, exclude) {
  const includeREs = (include ?? []).map(globToRegex);
  const excludeREs = (exclude ?? []).map(globToRegex);
  return refs.filter((r) => {
    const inc = includeREs.length === 0 || includeREs.some((re) => re.test(r.shortName));
    const exc = excludeREs.some((re) => re.test(r.shortName));
    return inc && !exc;
  });
}

/**
 * Tiny glob → RegExp. Treats `*` as `.*`, escapes everything else.
 * Anchored end-to-end so `main` doesn't match `mainline`.
 * @param {string} pattern
 */
function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * Extract structured diffs for every commit in `commits`. One subprocess
 * per commit — `git diff-tree -p` doesn't have a batch mode, but the
 * runtime here is dominated by the parse + write rather than the fork,
 * and the cap on commits keeps total work bounded.
 *
 * @param {import("./git/adapter.js").GitAdapter} adapter
 * @param {import("./manifest/write.js").ManifestWriter} writer
 * @param {readonly import("./git/types.js").SourceCommit[]} commits
 * @param {CacheState} cache
 */
async function extractDiffs(adapter, writer, commits, cache) {
  const todo = commits.filter((c) => !cache.diffShas.has(c.sha));
  const skipped = commits.length - todo.length;
  const t0 = Date.now();
  log(`extracting diffs: ${num(todo.length)} new, ${num(skipped)} cached`);
  if (todo.length === 0) return;

  let done = 0;
  for (const commit of todo) {
    const raw = await adapter.readCommitDiff(commit.sha);
    const files = parseUnifiedDiff(raw);

    // Highlight every diff line in place. We pick the language off the
    // post-image path (or pre-image for deletions) so the file
    // extension drives token colors. Per-line highlight is
    // context-free — multi-line constructs (block comments, template
    // literals) won't always tokenize correctly. Whole-file
    // context-aware diff highlighting is a Phase 7 polish item.
    for (const file of files) {
      if (file.binary) continue;
      const langPath = file.pathAfter ?? file.pathBefore;
      const lang = langPath ? detectLanguage(langPath) : null;
      if (!lang) continue;
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          line.html = await highlightDiffLine(line.text, lang);
        }
      }
    }

    await writer.writeDiff({
      commitSha: commit.sha,
      parentSha: commit.parent,
      files,
    });
    done++;
    if (done % 25 === 0 || done === todo.length) {
      log(`  ${num(done)}/${num(todo.length)} (${dur(Date.now() - t0)})`);
    }
  }
}

async function loadReactServerBuild() {
  try {
    return await import("@lazarv/react-server/build");
  } catch (err) {
    // @lazarv/react-server is a direct dependency of this package — if
    // the import failed, the install is broken (post-install skipped,
    // hoisting issue, monorepo misconfig, etc.).
    throw new Error(
      "Cannot load @lazarv/react-server/build. Reinstall the CLI dependencies " +
        "(this package depends on @lazarv/react-server directly). Original error: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}
