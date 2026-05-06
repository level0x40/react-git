/**
 * Shipped baseline `react-server` config for the generated app.
 *
 * Loaded by `react-server` whenever cwd is set to this directory —
 * which happens in BOTH the dev and build CLI paths in `react-git`.
 *
 * Why a static file (rather than dynamic injection via
 * `reactServer(..., initialConfig)`):
 *
 *   react-server's file-router plugin re-loads config from disk
 *   inside its own `configResolved` hook (`plugin.mjs` calls
 *   `loadConfig({}, options)` with an empty initial), so anything
 *   router-related (notably the `root` setting for the page-scan
 *   directory) MUST come from a config file — initialConfig won't
 *   reach it.
 *
 * Why the user-template overlay lives HERE (not in the CLI):
 *
 *   The merge boundary in react-server's design is the config file.
 *   Doing the overlay inside the CLI (via `initialConfig`) would
 *   suffer the same limitation as the file-router: anything bolted
 *   on through `initialConfig` gets dropped on the floor for any
 *   plugin that re-loads config. Putting it here means:
 *
 *     - `reactGitTemplatePlugin` is a real Vite plugin; every
 *       dependent plugin sees it on every reload.
 *     - User-supplied Vite options merge through cleanly.
 *     - Anyone running `react-server` against this directory by
 *       hand (without going through the `react-git` CLI) gets the
 *       same template behavior just by setting the env var.
 *     - The CLI stays a thin wrapper: it sets env vars and invokes
 *       react-server. All "shape" decisions live in this file.
 *
 * Env-var contract (set by `react-git` CLI; can also be set by hand):
 *
 *   - `REACT_GIT_MODE` (manifest|live)        ← read by `reactGitPlugin`
 *   - `REACT_GIT_REPO` absolute path          ← read by `reactGitPlugin`
 *   - `REACT_GIT_SOURCE_ROOT` absolute path   ← read by `reactGitPlugin`
 *   - `REACT_GIT_TEMPLATE_DIRS`               ← read by both this file
 *     `path.delimiter`-joined list of           and `reactGitTemplatePlugin`.
 *     absolute paths, in CLI order             Order: low → high priority,
 *     (low → high priority).                   so the LAST entry wins both
 *                                              for file overrides and config
 *                                              merging.
 *   - `REACT_GIT_TEMPLATE_DIR`                ← legacy single-template env
 *     (absolute path)                           var. Honored as a fallback
 *                                              when `REACT_GIT_TEMPLATE_DIRS`
 *                                              is unset (e.g. older tooling
 *                                              setting only the singular
 *                                              name).
 *
 * The data layer (`@level0x40/react-git/source`) is intentionally
 * usable as a standalone library — this config is the *generated
 * app's* config, not the data layer's.
 *
 * # Template overlay shape
 *
 * Template overlay used to be alias-based (Vite `resolve.alias`
 * mapping every shipped path → user file). That design had a fatal
 * flaw: a user file that wanted to *wrap* the original (the common
 * case) would import the original via the package's exports, and
 * the alias caught that import and pointed it back at the user
 * file → infinite loop. We now use a skeleton/impl split:
 *
 *   - The shipped pages and components in `app/src/{pages,components}/`
 *     are one-line re-exports from `virtual:rg/page/<rel>` and
 *     `virtual:rg/component/<name>`.
 *   - Real implementations live at `app/src/impl/{pages,components}/`.
 *   - `reactGitTemplatePlugin` resolves each `virtual:rg/...`
 *     specifier to either the user's template file or the built-in
 *     impl, with the template winning.
 *   - User wrap-around imports (`@level0x40/react-git/impl/...`) go
 *     directly to the impl via package exports — alias-immune.
 *
 * Each user template's `react-server.config.{mjs,js,ts}` (if any)
 * still gets deep-merged on top of this base config — in CLI order,
 * so a later template's config overrides an earlier one's, matching
 * the file-overlay priority.
 */

import * as path from "node:path";

import { defineConfig } from "@lazarv/react-server/config";
import { reactGitPlugin } from "@level0x40/react-git/vite";
import { reactGitTemplatePlugin } from "@level0x40/react-git/template-plugin";
import { loadUserConfig, mergeConfigs } from "@level0x40/react-git/template";

const ENV_TEMPLATE_DIRS = "REACT_GIT_TEMPLATE_DIRS";
const ENV_TEMPLATE_DIR_LEGACY = "REACT_GIT_TEMPLATE_DIR";

// ── Base config: what every invocation gets ──────────────────────────
const base = {
  // File-router scan root, relative to this config's location.
  root: "src/pages",

  // `export` enables react-server's static-site generator. Streaming
  // form (`async function*`): consume the file-router's path stream
  // lazily and yield each descriptor with `rsc: false` set, which
  // suppresses the per-route `rsc.x-component` payload at build time.
  //
  // Why no RSC payload: react-git's static export ships HTML for
  // human navigation; the in-app `<Link>` clicks never need to fetch
  // an RSC payload because every page is fully pre-rendered HTML.
  // Dropping `rsc.x-component` for every route halves the deployment
  // footprint with no loss of functionality (the .x-component file
  // is byte-comparable to the HTML it duplicates as serialized RSC).
  //
  // Streaming form (vs. the array-transform `(paths) => paths` that
  // used to live here) is the documented pattern for large path
  // sets — peak memory stays at one descriptor regardless of total
  // count, and rendering can start as soon as the first descriptor
  // is yielded. See https://react-server.dev/router/static#streaming-the-export-path-source.
  async *export(paths) {
    for await (const p of paths) {
      yield { ...p, rsc: false };
    }
  },

  // Cache profile backing every `"use cache"` directive in the data
  // layer (`@level0x40/react-git/source`). No TTL: within one
  // process the underlying data is immutable (commit shas, blob
  // contents), so dedup-forever is correct. In dev, the watcher in
  // `react-git dev` handles invalidation when refs move.
  cache: {
    profiles: {
      "react-git-data": {
        // No `ttl` → cache for the lifetime of the process.
        // Default in-memory provider — no disk persistence.
      },
    },
  },

  // The template plugin reads the same `REACT_GIT_TEMPLATE_DIRS` env
  // var we read below, so we register it unconditionally. When the
  // env var is unset, it resolves every `virtual:rg/...` specifier to
  // the built-in default template / impl — no-op overlay.
  plugins: [reactGitPlugin(), reactGitTemplatePlugin()],
};

// ── Optional config-level overlay: user `react-server.config.*` ──────
//
// The user's file overrides happen at the bundler level via the
// template plugin above; this layer is purely for *config* options
// (Vite plugins, server settings, virtual routes added by the user,
// etc.). Top-level await is fine here — `.mjs`/ESM, modern Node, and
// Vite is happy to await a config module.
//
// Multi-template: each entry in `REACT_GIT_TEMPLATE_DIRS` is loaded
// in order and deep-merged on top of the running config. The CLI
// passes them low → high priority, so the LAST entry is the last
// one merged and therefore has final say — same precedence the
// template plugin uses for file overrides.
const templateDirs = readTemplateDirs();
let merged = base;
for (const dir of templateDirs) {
  const userConfig = await loadUserConfig(dir);
  if (userConfig) merged = mergeConfigs(merged, userConfig);
}

export default defineConfig(merged);

/**
 * Read the active template stack from the env, with backwards
 * compatibility for the legacy single-path variable.
 *
 * @returns {string[]} absolute paths in CLI order (low → high priority)
 */
function readTemplateDirs() {
  const list = process.env[ENV_TEMPLATE_DIRS];
  if (list) {
    return list
      .split(path.delimiter)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const legacy = process.env[ENV_TEMPLATE_DIR_LEGACY];
  return legacy ? [legacy] : [];
}
