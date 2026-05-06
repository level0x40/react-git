/**
 * @file CLI entry — `react-git <command> [args]`.
 *
 * Two subcommands: `build` (static export) and `dev` (live preview).
 * No scaffolding command — the runtime runs the shipped `app/`
 * directly from the package, so a "scaffold a project" step would
 * just write a one-line `package.json` with a `build` script. Users
 * can write that themselves; future per-project customization will
 * arrive via `react-server.config.mjs` config-merging at the project
 * root, not via file-overlay templates.
 */

import { readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { buildSite } from "./build.js";
import { runDev } from "./dev.js";
import { CliError } from "./errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the shipped templates directory. */
const PACKAGE_TEMPLATES_DIR = path.resolve(__dirname, "../app/templates");

/**
 * Resolve a single `--template <value>` argument to an absolute
 * directory path.
 *
 * Three cases:
 *
 *   1. `value === undefined`  → built-in `default` template.
 *      Backwards-compatible with pre-template behavior — running
 *      `react-git dev` without flags still produces the original
 *      visual.
 *
 *   2. value contains a path separator OR resolves as an absolute
 *      path → user-supplied template directory. `path.resolve()` it
 *      against cwd. The plugin will fail loud at request time if the
 *      directory doesn't exist; we don't pre-validate to keep
 *      symlink/case-sensitivity behavior consistent with `path.resolve`.
 *
 *   3. value is a bare name → built-in lookup against
 *      `<package>/app/templates/<name>/`. Unknown names fail here with
 *      an actionable error listing what's available, so users don't
 *      hit "directory does not exist" later.
 *
 * The bare-name vs. path heuristic is the standard separator check —
 * if the user really wants to pass a relative dir whose name has no
 * separators, they prefix `./` (which matches a separator). Same
 * convention `npm` and most CLIs use for "plugin name vs. local path."
 *
 * @param {string} value  one entry — already split out from the
 *                        repeated/comma-separated CLI input.
 * @returns {string}  absolute path to the template directory
 */
function resolveOneTemplate(value) {
  if (path.isAbsolute(value) || /[/\\]/.test(value)) {
    return path.resolve(value);
  }

  const builtin = path.join(PACKAGE_TEMPLATES_DIR, value);
  if (isDirectory(builtin)) return builtin;

  const available = listBuiltinTemplates();
  throw new CliError(
    `unknown template "${value}". Available built-ins: ${available.join(", ")}. ` +
      `Pass a path (containing "/") to use a custom template directory.`,
    { exitCode: 2 },
  );
}

/**
 * Resolve the (possibly multi-valued) `--template` flag into an
 * ordered stack of absolute template directory paths.
 *
 * The flag accepts either form (or both at once):
 *   - repeated occurrences:   `--template w3c --template ./mine`
 *   - comma-separated values: `--template w3c,./mine`
 *
 * Order is significant: **later overrides previous**. The last entry
 * on the command line has the highest priority in tier 1 of the
 * template-plugin's resolution (see `runtime/template-plugin.js`),
 * and its `react-server.config.*` is deep-merged last in
 * `app/react-server.config.mjs`.
 *
 * When the flag is omitted entirely, the stack is `[<default>]` — a
 * single-entry stack pointing at the built-in `default` template, so
 * the runtime never falls through to the bare impl on the normal CLI
 * path.
 *
 * @param {string[] | undefined} raw  array as returned by `parseArgs`
 *                                    with `multiple: true`.
 * @returns {string[]} stack of absolute template directories
 */
function resolveTemplates(raw) {
  if (!raw || raw.length === 0) {
    return [path.join(PACKAGE_TEMPLATES_DIR, "default")];
  }
  const expanded = raw
    .flatMap((entry) => entry.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  if (expanded.length === 0) {
    return [path.join(PACKAGE_TEMPLATES_DIR, "default")];
  }
  return expanded.map(resolveOneTemplate);
}

/** @returns {string[]} sorted list of built-in template names */
function listBuiltinTemplates() {
  try {
    return readdirSync(PACKAGE_TEMPLATES_DIR)
      .filter((name) => isDirectory(path.join(PACKAGE_TEMPLATES_DIR, name)))
      .sort();
  } catch {
    return [];
  }
}

/** @param {string} p */
function isDirectory(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {readonly string[]} argv
 */
export async function main(argv) {
  // react-server's build banner + completion message read this global
  // to compute elapsed time. Their own dev action sets it (lib/dev/
  // action.mjs:67), but the build action only reads it — when it's
  // missing, the success line prints "completed in NaNs". Set it
  // here at the CLI entry so the timer covers our setup work too;
  // the dev action's later assignment overwrites it cleanly.
  globalThis.__react_server_start__ = Date.now();

  const [command, ...rest] = argv;

  switch (command) {
    case undefined:
    case "--help":
    case "-h":
    case "help":
      printHelp();
      return;

    case "build":
      await runBuild(rest);
      return;

    case "dev":
      await runDevCommand(rest);
      return;

    default:
      // Print help to stdout for the user, then throw a CliError so
      // the bin script's central handler emits the actionable line
      // and sets the exit code. Keeps all "exit with status N" logic
      // in one place.
      printHelp();
      throw new CliError(`unknown command: ${command}`, { exitCode: 2 });
  }
}

/**
 * @param {readonly string[]} args
 */
async function runBuild(args) {
  const { values, positionals } = parseArgs({
    args: canonicalizeOptionalValueArgs(args),
    options: {
      // ── react-git's own flags ───────────────────────────────────
      repo: { type: "string", default: process.cwd() },
      out: { type: "string", default: "./dist" },
      template: { type: "string", multiple: true },
      "max-commits": { type: "string" },
      "include-ref": { type: "string", multiple: true },
      "exclude-ref": { type: "string", multiple: true },
      "browse-ref": { type: "string", multiple: true },
      live: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      // ── react-server passthrough ────────────────────────────────
      ...REACT_SERVER_BUILD_PASSTHROUGH,
    },
    strict: true,
    allowPositionals: true,
  });
  assertSinglePositional(positionals, "build");

  const opts = {
    // Positional argument wins over `--repo`. Priority chain:
    //   1. positional `react-git build /some/path`
    //   2. explicit `--repo /some/path` flag
    //   3. fallback to cwd (--repo's schema default)
    // The most common invocation — `react-git build` with no args at
    // all — lands at cwd, which is what users almost always want.
    repo: positionals[0] ?? values.repo,
    out: values.out,
    // Resolve at the CLI boundary so dev.js / build.js receive a
    // ready-to-use stack of absolute paths. Defaults to a single-entry
    // stack pointing at the built-in `default` template when the flag
    // is omitted. Order matters: later wins (see resolveTemplates).
    templates: resolveTemplates(values.template),
    live: values.live === true,
  };
  if (values["max-commits"]) {
    opts.maxCommits = Number(values["max-commits"]);
  }
  // Both flags accept either repeated occurrences (--include-ref main
  // --include-ref release/*) or a single comma-separated list. Either
  // shape collapses into the same string[] downstream.
  const include = expandPatternList(values["include-ref"]);
  const exclude = expandPatternList(values["exclude-ref"]);
  if (include.length) opts.includeRef = include;
  if (exclude.length) opts.excludeRef = exclude;
  if (values.force) opts.force = true;

  // --browse-ref controls which refs the deep file-browser routes
  // (`/tree/<ref>/<path...>`) get prerendered for. Default (flag
  // omitted) is HEAD only — see app/src/pages/tree/[refSlug]/[...path].static.js
  // for the rationale (it's a RAM cap, not a page-count cap). `*`
  // opts in to every extracted ref. The flag is plumbed via env so
  // the staged `.static.js` file doesn't have to know about CLI shape.
  const browse = expandPatternList(values["browse-ref"]);
  if (browse.length) {
    process.env.REACT_GIT_BROWSE_REFS = browse.join(",");
  }

  // Forward everything that wasn't ours into the react-server build
  // call. `--deploy`, `--silent`, `--adapter <name>`, etc. all flow
  // through to `build()`'s second argument verbatim (after kebab →
  // camelCase normalisation, since the programmatic API expects camel).
  opts.passthrough = extractPassthrough(values, REACT_GIT_OWN_BUILD_FLAGS);
  coerceOptionalValueFlags(opts.passthrough);

  await buildSite(opts);
}

/**
 * @param {readonly string[]} args
 */
async function runDevCommand(args) {
  const { values, positionals } = parseArgs({
    args: canonicalizeOptionalValueArgs(args),
    options: {
      // ── react-git's own flags ───────────────────────────────────
      repo: { type: "string", default: process.cwd() },
      template: { type: "string", multiple: true },
      "max-commits": { type: "string" },
      "include-ref": { type: "string", multiple: true },
      "exclude-ref": { type: "string", multiple: true },
      "browse-ref": { type: "string", multiple: true },
      port: { type: "string" },
      host: { type: "string" },
      open: { type: "boolean", default: false },
      https: { type: "boolean", default: false },
      live: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      // ── react-server passthrough ────────────────────────────────
      ...REACT_SERVER_DEV_PASSTHROUGH,
    },
    strict: true,
    allowPositionals: true,
  });
  assertSinglePositional(positionals, "dev");

  /** @type {import("./dev.js").DevOptions} */
  const opts = {
    // Positional > --repo > cwd. See runBuild() for the full rationale.
    repo: positionals[0] ?? values.repo,
    templates: resolveTemplates(values.template),
    live: values.live === true,
  };
  if (values["max-commits"]) opts.maxCommits = Number(values["max-commits"]);
  const include = expandPatternList(values["include-ref"]);
  const exclude = expandPatternList(values["exclude-ref"]);
  if (include.length) opts.includeRef = include;
  if (exclude.length) opts.excludeRef = exclude;
  if (values.force) opts.force = true;
  if (values.port) opts.port = Number(values.port);
  if (values.host) opts.host = values.host;
  if (values.open) opts.open = true;
  if (values.https) opts.https = true;

  // Same env-driven --browse-ref plumbing as build. In dev, the
  // .static.{js} files this gates are not exercised (no static export
  // happens), so the flag is effectively a no-op today — but we
  // accept it for symmetry so the same flag set works for both
  // commands and so users can dry-run their build config.
  const browse = expandPatternList(values["browse-ref"]);
  if (browse.length) {
    process.env.REACT_GIT_BROWSE_REFS = browse.join(",");
  }

  // Forward everything that wasn't ours into the reactServer() call.
  // `--cors`, `--devtools`, `--inspect`, etc. flow through verbatim
  // after kebab → camelCase normalisation.
  opts.passthrough = extractPassthrough(values, REACT_GIT_OWN_DEV_FLAGS);
  coerceOptionalValueFlags(opts.passthrough);

  await runDev(opts);
}

/**
 * @param {string[] | undefined} raw
 * @returns {string[]}
 */
function expandPatternList(raw) {
  if (!raw || raw.length === 0) return [];
  return raw
    .flatMap((entry) => entry.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Both `build` and `dev` accept at most one positional — the repo path.
 * Two-or-more positionals is a user error: typo of a flag, or invoking
 * a flag that requires a value as a bare flag (so its intended value
 * lands in positionals). Fail fast with a clear message rather than
 * silently picking the first one and forgetting the rest.
 *
 * @param {readonly string[]} positionals
 * @param {string} command  for the error message
 */
function assertSinglePositional(positionals, command) {
  if (positionals.length > 1) {
    throw new CliError(
      `react-git ${command}: unexpected positional arguments after ` +
        `${JSON.stringify(positionals[0])}: ${positionals
          .slice(1)
          .map((p) => JSON.stringify(p))
          .join(", ")}. ` +
        `Pass at most one repo path; flags requiring a value need ` +
        `the value attached (e.g. --template primer, not --template primer foo).`,
      { exitCode: 2 },
    );
  }
}

// ── react-server flag passthrough ───────────────────────────────────────
//
// We let users invoke any `@lazarv/react-server` build/dev flag through
// `react-git build` / `react-git dev` (so `react-git build --deploy`
// works, as does `react-git dev --port 3001 --open`). Two design
// decisions baked in:
//
//   1. **Strict declaration over wildcard.** parseArgs in non-strict
//      mode handles `--port=3001` but mis-parses `--port 3001` into a
//      positional. To support the natural `--flag value` form, every
//      forwarded flag is declared explicitly with the right type.
//      The schema below is the full superset of react-server's own
//      build + dev CLI options.
//
//   2. **No flag-name overloading.** `--force` and `--mode` exist on
//      both sides with different meanings. We keep our `--force`
//      (cache wipe) and don't forward it; `--mode` is delegated to
//      react-server's meaning (production/development/etc.) — flip to
//      live extraction with our existing `--live` flag instead.
//
// The helper `extractPassthrough()` plucks anything not in the
// "ours" key list out of `values`, kebab → camelCase normalises it
// (matching react-server's programmatic API which mirrors cac's CLI
// camelCasing), and forwards it to `build()`/`reactServer()` as
// extra options.

/** Flags react-git owns for `build`. Anything else parsed → passthrough. */
const REACT_GIT_OWN_BUILD_FLAGS = [
  "repo",
  "out",
  "template",
  "max-commits",
  "include-ref",
  "exclude-ref",
  "browse-ref",
  "live",
  "force",
];

/** Flags react-git owns for `dev`. Anything else parsed → passthrough. */
const REACT_GIT_OWN_DEV_FLAGS = [
  "repo",
  "template",
  "max-commits",
  "include-ref",
  "exclude-ref",
  "browse-ref",
  "port",
  "host",
  "open",
  "https",
  "live",
  "force",
];

/** Schema for react-server's `build` flags we forward. */
const REACT_SERVER_BUILD_PASSTHROUGH = {
  deploy: { type: "string" },
  silent: { type: "boolean" },
  verbose: { type: "boolean" },
  export: { type: "boolean" },
  "export-concurrency": { type: "string" },
  compression: { type: "boolean" },
  "no-compression": { type: "boolean" },
  // react-server's programmatic build() reads `options.adapter[0]`,
  // i.e. it expects an array (matches its CLI's `--adapter` declared
  // with `multiple: true` semantics). Without this, a bare string
  // `"cloudflare"` is indexed by char and the build fails with
  // `Adapter not found "c"`.
  adapter: { type: "string", multiple: true },
  minify: { type: "boolean" },
  "no-minify": { type: "boolean" },
  sourcemap: { type: "string" },
  edge: { type: "boolean" },
  mode: { type: "string" },
  outDir: { type: "string" },
  eval: { type: "string", short: "e" },
  "no-color": { type: "boolean" },
  "no-check": { type: "boolean" },
  "no-validation": { type: "boolean" },
};

/** Schema for react-server's `dev` flags we forward. */
const REACT_SERVER_DEV_PASSTHROUGH = {
  cors: { type: "boolean" },
  origin: { type: "string" },
  "trust-proxy": { type: "boolean" },
  "clear-screen": { type: "boolean" },
  watch: { type: "boolean" },
  name: { type: "string", short: "n" },
  devtools: { type: "boolean" },
  inspect: { type: "boolean" },
  outDir: { type: "string" },
  mode: { type: "string" },
  eval: { type: "string", short: "e" },
  "no-color": { type: "boolean" },
  "no-check": { type: "boolean" },
  "no-validation": { type: "boolean" },
};

/**
 * Map of `--no-FOO` flag names to the underlying option they negate.
 * react-server's CLI uses cac, which converts `--no-color` to
 * `color: false` automatically. `parseArgs` doesn't, so we declare
 * the negation form explicitly and translate during extraction.
 */
const NEGATION_FLAG_MAP = {
  "no-minify": "minify",
  "no-compression": "compression",
  "no-color": "color",
  "no-check": "check",
  "no-validation": "validation",
};

/**
 * Flags react-server's CLI declares with `[options]` (optional value)
 * rather than `<value>` (required value). `parseArgs` can't natively
 * express "string OR boolean true," so a bare `--deploy` would error
 * with "argument missing." We pre-canonicalize bare occurrences into
 * `--deploy=true`; downstream `coerceOptionalValueFlags()` converts
 * the `"true"` string back to a real boolean before forwarding to
 * react-server (which accepts both forms via cac's `[options]` syntax).
 *
 * Conservative set — only flags react-server actually declares as
 * optional-value go in here. `--eval` is also `[code]` but it's
 * read-from-stdin when bare, which we don't want to silently flip
 * to `true`; users must pass the code via `=` form or env.
 */
const OPTIONAL_VALUE_PASSTHROUGH_FLAGS = new Set(["deploy", "sourcemap"]);

/**
 * Pre-process raw argv so `--FLAG` (bare) becomes `--FLAG=true` for any
 * flag in `OPTIONAL_VALUE_PASSTHROUGH_FLAGS`. Bare here means: not
 * already `--FLAG=value` form, AND the next token either doesn't
 * exist or looks like another flag (starts with `-`). When the next
 * token doesn't look like a flag, leave it alone — the user wrote
 * `--deploy '{"key":"val"}'` and we want parseArgs to consume the
 * JSON as the value.
 *
 * @param {readonly string[]} args
 * @returns {string[]}
 */
function canonicalizeOptionalValueArgs(args) {
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--") && !a.includes("=")) {
      const name = a.slice(2);
      if (OPTIONAL_VALUE_PASSTHROUGH_FLAGS.has(name)) {
        const next = args[i + 1];
        if (next === undefined || next.startsWith("-")) {
          out.push(`${a}=true`);
          continue;
        }
      }
    }
    out.push(a);
  }
  return out;
}

/**
 * Reverse of the canonicalize step: any optional-value flag whose
 * forwarded value is the literal string `"true"` is the bare-form
 * sentinel — convert to real boolean. `"false"` symmetric. Other
 * string values pass through (the user actually supplied them).
 *
 * @param {Record<string, unknown>} passthrough
 */
function coerceOptionalValueFlags(passthrough) {
  for (const key of Object.keys(passthrough)) {
    if (!OPTIONAL_VALUE_PASSTHROUGH_FLAGS.has(key)) continue;
    if (passthrough[key] === "true") passthrough[key] = true;
    else if (passthrough[key] === "false") passthrough[key] = false;
  }
}

/**
 * Pluck non-react-git options out of a parsed `values` object and
 * normalise kebab keys to camelCase for the react-server programmatic
 * API (which mirrors cac's auto-camelCasing — `--export-concurrency`
 * becomes `exportConcurrency`).
 *
 * @param {Record<string, unknown>} values
 * @param {readonly string[]} ourKeys
 * @returns {Record<string, unknown>}
 */
function extractPassthrough(values, ourKeys) {
  /** @type {Record<string, unknown>} */
  const out = {};
  const ourSet = new Set(ourKeys);
  for (const [key, value] of Object.entries(values)) {
    if (ourSet.has(key)) continue;
    if (value === undefined) continue;
    // Translate cac-style `--no-FOO` to the underlying boolean option.
    // parseArgs gives us `noFoo: true`; react-server's action() expects
    // `foo: false`. Same boolean intent, different surface convention.
    if (key in NEGATION_FLAG_MAP) {
      const baseKey = NEGATION_FLAG_MAP[key];
      out[baseKey] = !value;
      continue;
    }
    out[kebabToCamel(key)] = value;
  }
  return out;
}

/**
 * @param {string} s
 * @returns {string}
 */
function kebabToCamel(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function printHelp() {
  // List built-in templates dynamically so adding one in the templates
  // directory doesn't desync the help text. Falls back to "default" if
  // the templates dir can't be read.
  const builtins = listBuiltinTemplates();
  const builtinList = builtins.length ? builtins.join(", ") : "default";
  process.stdout.write(
    `react-git — static Git source artifact viewer (powered by @lazarv/react-server)\n` +
      `\n` +
      `USAGE\n` +
      `  react-git build [repo] [options]\n` +
      `  react-git dev   [repo] [options]\n` +
      `  react-git --help\n` +
      `  react-git --version\n` +
      `\n` +
      `ARGUMENTS\n` +
      `  [repo]                          Path to the Git repository to render.\n` +
      `                                  Default: current working directory (\`.\`).\n` +
      `                                  \`--repo <path>\` is also accepted as an alias.\n` +
      `\n` +
      `COMMON OPTIONS (build + dev)\n` +
      `  --template <name|dir>           Built-in theme (${builtinList})\n` +
      `                                  or path to a custom template directory.\n` +
      `                                  Repeat or comma-separate to stack; later wins.\n` +
      `                                  Default: default.\n` +
      `  --max-commits <n>               Cap commits stored in per-ref \`/log\` shards.\n` +
      `                                  Does NOT cap the contribution calendar (which\n` +
      `                                  uses its own uncapped 53-week shard).\n` +
      `                                  Default: 50.\n` +
      `  --include-ref <pattern>         Refs to extract (repeat or comma-separate).\n` +
      `                                  Patterns support \`*\` wildcards.\n` +
      `                                  Default: every branch + tag.\n` +
      `  --exclude-ref <pattern>         Refs to drop after \`--include-ref\`.\n` +
      `                                  Wins on conflict.\n` +
      `  --browse-ref <name|*>           Refs whose deep file paths get prerendered\n` +
      `                                  for \`/tree/<ref>/<path...>\`. \`*\` opts in to\n` +
      `                                  every extracted ref. Repeat or comma-separate.\n` +
      `                                  Default: HEAD only.\n` +
      `  --live                          Skip extraction; query Git directly per render.\n` +
      `                                  Best for dev iteration against a moving repo.\n` +
      `                                  Default: off (manifest mode).\n` +
      `  --force                         Wipe the react-git extraction + build caches\n` +
      `                                  before this run. Not forwarded to react-server.\n` +
      `\n` +
      `BUILD-ONLY OPTIONS\n` +
      `  --out <path>                    Output directory for the static site.\n` +
      `                                  Default: ./dist.\n` +
      `\n` +
      `DEV-ONLY OPTIONS\n` +
      `  --port <n>                      Dev server port (default: 3000).\n` +
      `  --host <h>                      Dev server host (e.g. 0.0.0.0 to expose on LAN).\n` +
      `  --open                          Open the dev URL in the default browser.\n` +
      `  --https                         Serve over HTTPS with an auto-generated cert.\n` +
      `\n` +
      `REACT-SERVER PASSTHROUGH (build)\n` +
      `  Any flag here is forwarded verbatim to \`@lazarv/react-server build\`.\n` +
      `  Most accept \`--no-<flag>\` to opt out (e.g. --no-compression, --no-minify).\n` +
      `  --deploy [adapter]              Build for + deploy to a target. Optional value.\n` +
      `  --adapter <name>                Deployment adapter (cloudflare, vercel, …).\n` +
      `  --export                        Force static export on (default: on when at\n` +
      `                                  least one route declares a \`.static.*\` source).\n` +
      `  --export-concurrency <n>        Parallelism for the static export.\n` +
      `  --compression                   Emit \`.gz\` / \`.br\` sidecars (default: on).\n` +
      `                                  Pair with --no-compression to skip.\n` +
      `  --minify                        Minify output (default: on). --no-minify to skip.\n` +
      `  --sourcemap <mode>              Source-map mode (e.g. inline, hidden).\n` +
      `  --edge                          Build for an edge runtime target.\n` +
      `  --mode <production|development> Build mode (default: production).\n` +
      `                                  Forwarded — does NOT collide with --live.\n` +
      `  --silent                        Suppress non-essential build output.\n` +
      `  --verbose                       Print extra build diagnostics.\n` +
      `  --no-check                      Skip schema/route validation at build time.\n` +
      `  --no-validation                 Same as --no-check.\n` +
      `  --no-color                      Disable ANSI colour codes.\n` +
      `  -e, --eval <code>               Inline config snippet evaluated by react-server.\n` +
      `\n` +
      `REACT-SERVER PASSTHROUGH (dev)\n` +
      `  --cors                          Enable CORS on the dev server.\n` +
      `  --origin <url>                  Override the public origin used for absolute URLs.\n` +
      `  --trust-proxy                   Honour X-Forwarded-* headers behind a proxy.\n` +
      `  --clear-screen                  Clear the terminal between dev events.\n` +
      `  --watch                         Force watch mode (on by default for \`dev\`).\n` +
      `  --devtools                      Enable react-server's in-page devtools panel.\n` +
      `  --inspect                       Enable Node's V8 inspector.\n` +
      `  -n, --name <name>               Project name shown in the devtools UI.\n` +
      `  --mode <production|development> Dev-server mode (default: development).\n` +
      `  --no-check / --no-validation    Skip schema/route validation.\n` +
      `  --no-color                      Disable ANSI colour codes.\n` +
      `  -e, --eval <code>               Inline config snippet evaluated by react-server.\n` +
      `\n` +
      `TEMPLATES\n` +
      `  --template <name>               Built-in theme: ${builtinList}.\n` +
      `  --template <dir>                Custom template directory (path containing a "/").\n` +
      `  --template a --template b       Stack — later overrides previous; \`b\` wins both for\n` +
      `                                  file overrides and config-merge precedence.\n` +
      `  --template a,b                  Comma-separated form, same precedence as repeated.\n` +
      `\n` +
      `EXAMPLES\n` +
      `  react-git build                                    # build cwd to ./dist\n` +
      `  react-git build /path/to/repo --out ./site\n` +
      `  react-git build --template w3c --no-compression\n` +
      `  react-git build --include-ref 'release/*' --exclude-ref 'wip/*'\n` +
      `  react-git build --browse-ref '*' --max-commits 200\n` +
      `  react-git build --deploy --adapter cloudflare      # passthrough to react-server\n` +
      `  react-git dev --port 4000 --open\n` +
      `  react-git dev --live --host 0.0.0.0\n` +
      `\n` +
      `CONFLICTS & NOTES\n` +
      `  --force                         Owned by react-git (cache wipe); NOT forwarded.\n` +
      `  --mode                          Forwarded as-is. Pass --live for live extraction.\n` +
      `  --out vs --outDir               --out is react-git's user-facing output dir.\n` +
      `                                  --outDir is the react-server-internal staging\n` +
      `                                  dir; react-git overrides it unconditionally.\n` +
      `\n` +
      `Full docs: https://react-git.level0x40.com\n`,
  );
}
