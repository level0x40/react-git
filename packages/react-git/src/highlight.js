/**
 * @file Build-time syntax highlighting via Shiki. The highlighter is
 * loaded lazily on first call (Shiki's grammar bundles are non-trivial,
 * and we don't want to pay that cost on builds that turn out to be
 * 100% binaries / unknown extensions).
 *
 * Output strategy: emit dual-theme HTML in one pass via Shiki's
 * `themes: { light, dark }` option. Tokens carry both colors as CSS
 * variables (`--shiki-light`, `--shiki-dark`); a single CSS @media
 * block flips between them at runtime, so consumers don't ship a JS
 * theme switcher.
 *
 * Per-line tokenization for diffs is intentionally context-free — each
 * +/-/context line is highlighted in isolation. This loses fidelity
 * for multi-line constructs (block comments, template literals), but
 * matches the diff's row-by-row layout and keeps the data model flat.
 * Whole-file context-aware diff highlighting (à la GitHub) is a Phase
 * 7 polish item.
 */

/**
 * Languages we ship grammars for. Adding a language here is the only
 * change needed; the public API auto-resolves aliases below.
 */
const SHIKI_LANGS = [
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "json",
  "markdown",
  "css",
  "scss",
  "html",
  "xml",
  "yaml",
  "toml",
  "python",
  "ruby",
  "go",
  "rust",
  "java",
  "kotlin",
  "swift",
  "c",
  "cpp",
  "shell",
  "bash",
  "sql",
];

/**
 * Map detector extensions → Shiki language IDs. Anything not listed
 * passes through to SHIKI_LANGS as-is; if it's not in there either,
 * highlight() returns null and the page falls back to plain text.
 */
const ALIASES = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  md: "markdown",
  mdx: "markdown",
  yml: "yaml",
  py: "python",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin",
  h: "c",
  hpp: "cpp",
  sh: "shell",
  zsh: "shell",
  fish: "shell",
  sass: "scss",
  less: "scss",
  svg: "xml",
};

/**
 * Dual-theme pairing — high-contrast GitHub palette in both modes.
 * Solarized-light + tokyo-night were the previous defaults but read
 * too washed-out for source code (especially solarized-light, whose
 * yellow-on-cream syntax tokens are notoriously low-contrast); they
 * also clashed with the docs-style react-server template, whose own
 * stylesheet mirrors github.com.
 *
 *   - `github-light` (light)        — white bg #ffffff, classic GitHub
 *     syntax: red keywords, blue identifiers, green strings, purple
 *     constants. Matches the Primer palette the rest of the docs use.
 *   - `github-dark-dimmed` (dark)   — Primer dimmed bg #22272e, lower
 *     contrast than github-dark to ease eye strain over long reads.
 *     Same theme the react-server docs themselves load
 *     (`highlight.js/styles/github-dark-dimmed.css`).
 *
 * If you change either, also update `--rg-code-bg` in
 * `app/templates/default/src/styles/main.css` (light + dark blocks)
 * so the container padding stays continuous with the `<pre>`'s
 * theme bg — see the comment on `.rg-shiki-host` there. Other
 * templates pin their own bg if they want shiki containers to match.
 */
const THEMES = { light: "github-light", dark: "github-dark-dimmed" };

/** @type {Promise<import("shiki").Highlighter> | null} */
let highlighterPromise = null;

async function getHighlighter() {
  if (!highlighterPromise) {
    const { createHighlighter } = await import("shiki");
    highlighterPromise = createHighlighter({
      themes: Object.values(THEMES),
      langs: SHIKI_LANGS,
    });
  }
  return highlighterPromise;
}

/**
 * @param {string | null} lang
 * @returns {string | null} Shiki language ID, or null if unsupported
 */
function resolveLang(lang) {
  if (!lang) return null;
  const lower = lang.toLowerCase();
  const resolved = ALIASES[lower] ?? lower;
  return SHIKI_LANGS.includes(resolved) ? resolved : null;
}

/**
 * Highlight an entire blob into one block of HTML. Used by BlobView for
 * full-file rendering with CSS counter–driven line numbers.
 *
 * @param {string} code
 * @param {string | null} lang
 * @returns {Promise<string | null>}
 */
export async function highlightBlob(code, lang) {
  const resolved = resolveLang(lang);
  if (!resolved) return null;
  try {
    const h = await getHighlighter();
    return h.codeToHtml(code, { lang: resolved, themes: THEMES });
  } catch {
    return null;
  }
}

/**
 * Highlight a single diff line. Returns just the inner token spans
 * (no wrapping `<pre><code><span class="line">`) so the caller can
 * inline it inside the existing diff `<table>` row.
 *
 * Shiki's codeToHtml output for a one-line input looks like:
 *
 *   <pre class="shiki shiki-themes …" style="…">
 *     <code>
 *       <span class="line">
 *         <span style="…">tok</span><span style="…">tok</span>
 *       </span>
 *     </code>
 *   </pre>
 *
 * We trim the outer wrappers down to the contents of `<span class="line">`.
 *
 * @param {string} line  one line of source text (no trailing newline)
 * @param {string | null} lang
 * @returns {Promise<string | null>}
 */
export async function highlightDiffLine(line, lang) {
  const resolved = resolveLang(lang);
  if (!resolved) return null;
  try {
    const h = await getHighlighter();
    const html = h.codeToHtml(line, { lang: resolved, themes: THEMES });
    // Anchored extract — Shiki always emits exactly this shape, so a
    // simple regex is robust enough. If Shiki changes the wrapper we'll
    // catch it in dogfood and adjust here.
    const m = html.match(/<span class="line">(.*)<\/span>\s*<\/code>/s);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Drop the highlighter so a long-running process can free its memory. */
export async function disposeHighlighter() {
  if (!highlighterPromise) return;
  const h = await highlighterPromise;
  h.dispose?.();
  highlighterPromise = null;
}
