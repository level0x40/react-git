/**
 * @file Vite plugin that resolves `virtual:rg/page/<rel>`,
 * `virtual:rg/component/<name>`, and `virtual:rg/style/<name>`
 * import specifiers via a three-tier lookup:
 *
 *   1. User-supplied template files at
 *      `<templateDir>/src/{pages,components,styles}/<rel>.{jsx,tsx,js,ts,css}`.
 *      Multiple template dirs are supported — the CLI accepts repeated
 *      `--template` flags (or a comma-separated list), and each entry
 *      becomes a layer in this tier. Layer order matters: **later
 *      overrides previous**, so for `--template a --template b` the
 *      plugin looks in `b/src/...` first, then `a/src/...`. This is
 *      flat overlay merging, not multi-layer extension — a wrap-style
 *      template at position N can compose with the impl (via
 *      `@level0x40/react-git/impl/...`), but it cannot wrap an override
 *      from another template at position N-1. If you need that, your
 *      wrapper should depend on the impl directly and the templates
 *      it stacks with should not own the same file.
 *   2. The built-in `default` template at
 *      `<package>/app/templates/default/src/{pages,components,styles}/<rel>.…`.
 *      A partial template — say, one that only ships
 *      `src/components/FileIcon.jsx` and no stylesheet — picks up
 *      the default theme's main.css here, instead of falling
 *      through to the bare structural reset. Skipped when one of
 *      the active templates IS `default` (tier 1 already searched it).
 *   3. The shipped baseline at
 *      `<package>/app/src/impl/{pages,components,styles}/<rel>.…`.
 *      Final floor; reached only when none of the active templates
 *      and `default` ship the requested file (or when no template
 *      is active at all).
 *
 * # Why an indirection layer (instead of `resolve.alias`)
 *
 * The earlier alias-based design was fundamentally broken: a user
 * override that wanted to *wrap* the original (the common case —
 * "render the built-in commit page but inject an extra block") would
 * import the original via the package's exports. The package exports
 * pointed to the shipped page file. The shipped page file was the
 * alias *target*. So the user's wrap import resolved to the user's
 * own file → user file imports user file → infinite loop / circular.
 *
 * Skeleton/impl separation breaks the cycle structurally:
 *
 *   - `app/src/pages/...` and `app/src/components/...` are now
 *     **skeletons** — one-line re-exports from `virtual:rg/...`.
 *     These are the files the file-router scans and the layout
 *     imports; they own the route shape.
 *
 *   - `app/src/impl/{pages,components}/...` are the **actual
 *     implementations**. The package exports `./impl/*` so user
 *     templates can import them directly with no virtual-prefix
 *     indirection — that's the alias-immune path the user wraps
 *     through.
 *
 *   - This plugin connects the two. When a skeleton resolves
 *     `virtual:rg/component/CommitLink`, the plugin checks the
 *     template dir first and falls back to the built-in impl.
 *
 * # The cycle that does NOT happen
 *
 *   user template:          template/src/components/CommitLink.jsx
 *                              → imports `@level0x40/react-git/impl/components/CommitLink`
 *                              → resolves DIRECTLY (package exports), no plugin involvement
 *                              → built-in impl loads
 *                              → returns wrapped component
 *
 *   page render path:       virtual:rg/component/CommitLink
 *                              → plugin sees template/src/components/CommitLink.jsx exists
 *                              → returns user file
 *                              → user file imports impl directly
 *                              → no recursive virtual resolution
 *
 * Resolution returns a **real filesystem path** rather than emitting
 * synthetic content. That keeps Vite's HMR, source maps, react-server's
 * `"use client"` directive plugin, and the Vite dependency optimizer
 * all working unmodified — they read the actual file off disk and see
 * directives at the top of the impl, exactly where they expect.
 *
 * # Specifier shape
 *
 *   virtual:rg/page/<relative-from-pages-dir-no-extension>
 *   virtual:rg/component/<name-no-extension>
 *   virtual:rg/style/<name-no-extension>          (resolves under styles/, .css only)
 *
 * Examples:
 *   virtual:rg/page/page                          → src/{impl/,}pages/page.jsx
 *   virtual:rg/page/commit/[sha].page             → src/{impl/,}pages/commit/[sha].page.jsx
 *   virtual:rg/page/tree/[refSlug]/[...path].page → src/{impl/,}pages/tree/[refSlug]/[...path].page.jsx
 *   virtual:rg/component/FileBrowser              → src/{impl/,}components/FileBrowser.jsx
 *   virtual:rg/style/main                         → src/{impl/,}styles/main.css
 *
 * The `[…]`/`[...…]` segments are passed through verbatim — Vite has
 * no opinion about them in resolveId, only the file router does.
 *
 * # Why styles get their own kind
 *
 * The base impl ships only the structural CSS the layout absolutely
 * needs — box-sizing reset, code-block overflow handling. Everything
 * decorative lives in `app/templates/<name>/src/styles/main.css`. The
 * default-active template (`default`) holds the full out-of-the-box
 * visual; alternates (`w3c`, `primer`, `react-server`, `tui`,
 * `sketchpad`)
 * override with their own. This split lets a template completely
 * replace the visual without competing with default styles via
 * cascade — the template's `main.css` IS the entire stylesheet, the
 * minimal base prepended only.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the shipped baseline app inside this package. */
const PACKAGE_APP_DIR = path.resolve(__dirname, "../../app");

/**
 * Absolute path to the built-in `default` template. Acts as a
 * mid-tier fallback between an active user template and the bare
 * `app/src/impl` baseline: any virtual specifier the user template
 * doesn't supply (a custom template that overrides only `FileIcon`
 * but ships no `main.css`, for instance) resolves here instead of
 * falling all the way through to `impl`. Concretely this means a
 * component-only custom template still picks up the default theme's
 * full visual instead of the bare structural reset.
 */
const PACKAGE_DEFAULT_TEMPLATE_DIR = path.resolve(__dirname, "../../app/templates/default");

const PAGE_PREFIX = "virtual:rg/page/";
const COMPONENT_PREFIX = "virtual:rg/component/";
const STYLE_PREFIX = "virtual:rg/style/";

/**
 * Per-kind extension search order. JS/TS variants for code modules,
 * `.css` only for styles. Keeping these per-kind avoids `tryResolveExt`
 * accidentally matching `<name>.jsx` for a `virtual:rg/style/<name>`
 * specifier or vice versa — those would be confusing failures with the
 * generic catch-all.
 */
const KIND_EXTENSIONS = {
  pages: [".jsx", ".tsx", ".js", ".ts", ".mjs", ".mts"],
  components: [".jsx", ".tsx", ".js", ".ts", ".mjs", ".mts"],
  styles: [".css"],
};

/**
 * @param {string} dir
 * @param {string} rel  relative path without extension
 * @param {readonly string[]} extensions  search order
 * @returns {string | null} absolute path to first existing file, or null
 */
function tryResolveExt(dir, rel, extensions) {
  for (const ext of extensions) {
    const candidate = path.join(dir, rel + ext);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve a `virtual:rg/...` specifier to a real file path. The
 * highest-priority user template wins; built-in impl is the final
 * fallback. Returns null if no tier produces a hit (caller should
 * error — that means a skeleton points at an impl that doesn't exist).
 *
 * @param {string} specifier
 * @param {readonly string[]} templateDirs  in CLI order (low→high priority);
 *                                          the function searches in reverse
 *                                          so the LAST entry wins.
 * @returns {string | null}
 */
function resolveVirtual(specifier, templateDirs) {
  let kindDir;
  let rel;
  if (specifier.startsWith(PAGE_PREFIX)) {
    kindDir = "pages";
    rel = specifier.slice(PAGE_PREFIX.length);
  } else if (specifier.startsWith(COMPONENT_PREFIX)) {
    kindDir = "components";
    rel = specifier.slice(COMPONENT_PREFIX.length);
  } else if (specifier.startsWith(STYLE_PREFIX)) {
    kindDir = "styles";
    rel = specifier.slice(STYLE_PREFIX.length);
  } else {
    return null;
  }

  // Defense-in-depth: refuse path-traversal segments and absolute
  // paths in the relative segment. The skeletons we ship build
  // these specifiers from string literals so this should never
  // trip in practice; surface a clear failure if a bad refactor
  // introduces one.
  //
  // Important: check `..` as a *segment*, not as a substring.
  // Catch-all route names like `[...path]` and `[...slug]` legally
  // contain `..` inside `[...]` and aren't traversal — a substring
  // check would reject every dynamic catch-all skeleton ships.
  if (path.isAbsolute(rel) || rel.split("/").includes("..")) {
    throw new Error(`[react-git] invalid virtual specifier (path traversal): ${specifier}`);
  }

  const extensions = KIND_EXTENSIONS[kindDir];

  // Tier 1 — active user templates. The CLI passes them in argument
  // order (low → high priority); we walk them in reverse so the last
  // template on the command line wins. This is flat overlay merging,
  // not chained extension: each template either ships a file at this
  // path or it doesn't. A template at position N can wrap the impl
  // (`@level0x40/react-git/impl/...`) but not another template's
  // override at position N-1.
  let defaultIsActive = false;
  for (let i = templateDirs.length - 1; i >= 0; i--) {
    const dir = templateDirs[i];
    if (dir === PACKAGE_DEFAULT_TEMPLATE_DIR) defaultIsActive = true;
    const userHit = tryResolveExt(path.join(dir, "src", kindDir), rel, extensions);
    if (userHit) return userHit;
  }

  // Tier 2 — the built-in `default` template. Any specifier none of
  // the active templates supply lands here, so a partial template
  // (e.g. only `src/components/FileIcon.jsx`, no `src/styles/main.css`)
  // gets the default theme's stylesheet instead of falling all the
  // way through to the bare `app/src/impl` reset. Skipped when one
  // of the active templates IS the default — tier 1 already searched
  // it (and any template stacked on top would have overridden it
  // anyway in this hit, since user-stack hits return immediately).
  if (!defaultIsActive) {
    const defaultHit = tryResolveExt(
      path.join(PACKAGE_DEFAULT_TEMPLATE_DIR, "src", kindDir),
      rel,
      extensions,
    );
    if (defaultHit) return defaultHit;
  }

  // Tier 3 — bare `app/src/impl` baseline. Reached only when no
  // template is active AND the default template doesn't ship the
  // requested kind, OR the resolution is for a kind the default
  // template never overrides (currently every kind except styles
  // and `FileIcon`).
  const builtinHit = tryResolveExt(
    path.join(PACKAGE_APP_DIR, "src", "impl", kindDir),
    rel,
    extensions,
  );
  if (builtinHit) return builtinHit;

  return null;
}

/**
 * @typedef {object} ReactGitTemplatePluginOptions
 * @property {readonly string[]} [templateDirs]
 *   Stack of absolute paths to user template directories, in CLI
 *   order (low → high priority — last entry wins). When empty or
 *   undefined, all virtual specifiers fall through to the built-in
 *   `default` template + impl baseline. Defaults to the
 *   `REACT_GIT_TEMPLATE_DIRS` env var (`path.delimiter`-joined list)
 *   with `REACT_GIT_TEMPLATE_DIR` (single path) honored as a legacy
 *   fallback, so the same plugin call works whether the CLI sets the
 *   env vars or the user passes them explicitly in their config.
 * @property {string} [templateDir]
 *   Legacy single-template option, kept for backwards compatibility.
 *   Equivalent to passing `templateDirs: [templateDir]`. If both are
 *   set, `templateDirs` wins.
 */

/**
 * @param {ReactGitTemplatePluginOptions} [options]
 */
export function reactGitTemplatePlugin(options = {}) {
  /** @type {readonly string[]} */
  let dirs;
  if (options.templateDirs && options.templateDirs.length > 0) {
    dirs = options.templateDirs;
  } else if (options.templateDir) {
    dirs = [options.templateDir];
  } else if (process.env.REACT_GIT_TEMPLATE_DIRS) {
    dirs = process.env.REACT_GIT_TEMPLATE_DIRS.split(path.delimiter).filter(Boolean);
  } else if (process.env.REACT_GIT_TEMPLATE_DIR) {
    dirs = [process.env.REACT_GIT_TEMPLATE_DIR];
  } else {
    dirs = [];
  }

  /** @type {readonly string[]} */
  const absDirs = dirs.map((d) => path.resolve(d));

  return {
    name: "@level0x40/react-git/template",

    // `enforce: "pre"` so we resolve before Vite's default resolver
    // tries (and fails) to find a `virtual:rg/...` spec on disk.
    enforce: /** @type {const} */ ("pre"),

    /**
     * @param {string} id
     */
    resolveId(id) {
      if (
        !id.startsWith(PAGE_PREFIX) &&
        !id.startsWith(COMPONENT_PREFIX) &&
        !id.startsWith(STYLE_PREFIX)
      ) {
        return null;
      }
      const resolved = resolveVirtual(id, absDirs);
      if (!resolved) {
        // Fail loud rather than letting Vite's later passes report
        // a confusing "cannot find module virtual:rg/..." — the
        // skeleton author has miswired something.
        const searched = [
          ...absDirs,
          PACKAGE_DEFAULT_TEMPLATE_DIR,
          `${PACKAGE_APP_DIR}/src/impl`,
        ].join(", ");
        throw new Error(
          `[react-git] no impl or template file found for ${id} (looked in ${searched})`,
        );
      }
      return resolved;
    },
  };
}
