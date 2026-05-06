/**
 * @file Lazy-initialized `marked` instance for rendering markdown
 * bodies. Used for two contexts: commit message bodies (small, mostly
 * URL-and-emphasis content) and full `.md` blobs surfaced through the
 * blob viewer.
 *
 * Why `marked` and not `markdown-it`:
 *
 *   - Zero runtime dependencies. markdown-it pulls in `entities`,
 *     `linkify-it`, `mdurl`, `uc.micro`, `argparse` — and `entities`
 *     ships sourcemaps with a remote `sourceRoot` that Vite's dev
 *     server warns about on every cold start. `marked` is a single
 *     package with no transitive deps; the warning goes away.
 *
 *   - Smaller install surface (~30 KB vs ~700 KB).
 *
 *   - Same feature footprint we actually use: GFM emphasis, code,
 *     code blocks, headers, lists, blockquotes, tables, autolinked
 *     bare URLs.
 *
 * Why lazy: marked is small but still pulls a few KB of regex tables
 * into memory on construction. CLI invocations that never touch a
 * commit page (e.g. `react-git build` with no commit detail in scope,
 * or static checks) shouldn't pay that cost.
 *
 * Safety: marked passes raw HTML through by default (unlike
 * markdown-it's `html: false`). We override the `html` renderer to
 * HTML-escape the token text instead, which makes `<script>...` in a
 * commit message render as literal text. The override covers BOTH
 * block-level HTML tokens and inline-tag tokens (one renderer
 * function handles `Tokens.HTML | Tokens.Tag` per marked's API), so
 * `dangerouslySetInnerHTML` of the result is safe without an external
 * sanitizer dependency.
 *
 * Linkify: bare URLs are auto-linked via `gfm: true` (the default).
 * PR/issue refs like `#123` are NOT linkified — no upstream URL is
 * known here; that's a viewer responsibility, not a renderer one.
 */

/** @type {import("marked").Marked | null} */
let _md = null;
/** @type {Promise<import("marked").Marked> | null} */
let _mdPromise = null;

async function getMd() {
  if (_md) return _md;
  if (_mdPromise) return _mdPromise;
  _mdPromise = (async () => {
    const { Marked } = await import("marked");
    const md = new Marked({
      gfm: true, // GFM autolinks, tables, fenced blocks, strikethrough
      breaks: false, // single newlines stay as soft breaks (commit-message convention)
    });
    // Open links in a new tab and harden `rel`. Commit-body links
    // are external by definition (issue trackers, PR URLs); for `.md`
    // blobs the same rule is conservative-but-correct (preview-only
    // rendering of repo content, no in-app navigation expected).
    md.use({
      renderer: {
        /**
         * Override link rendering to add `target="_blank"` + harden
         * `rel`. Commit-body links are external by definition (issue
         * trackers, PR URLs); for `.md` blobs the same rule is
         * conservative-but-correct (preview-only rendering of repo
         * content, no in-app navigation expected).
         *
         * @this {import("marked").RendererThis}
         * @param {{ href: string, title: string | null, tokens: import("marked").Tokens.Token[] }} t
         */
        link({ href, title, tokens }) {
          const text = this.parser.parseInline(tokens);
          const hrefAttr = ` href="${escapeHtml(href)}"`;
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
          return `<a${hrefAttr}${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
        },
        /**
         * Override HTML-token rendering to ESCAPE the source rather
         * than pass it through. Equivalent of markdown-it's
         * `html: false`. This is what makes `dangerouslySetInnerHTML`
         * of the result safe — a commit message of literal
         * `<script>alert(1)</script>` renders as visible text, never
         * executes. Covers both block (`Tokens.HTML`) and inline
         * (`Tokens.Tag`) HTML tokens; marked's typed renderer API
         * exposes a single `html(token)` hook for the union.
         *
         * @param {{ text: string }} token
         */
        html({ text }) {
          return escapeHtml(text);
        },
      },
    });
    _md = md;
    return _md;
  })();
  return _mdPromise;
}

/**
 * Render a markdown body to HTML. Returns an empty string for
 * empty/missing input — callers can use that as the "no body" signal
 * without an explicit null check.
 *
 * @param {string | undefined | null} text
 * @returns {Promise<string>}
 */
export async function renderCommitMarkdown(text) {
  if (!text || !text.trim()) return "";
  const md = await getMd();
  // marked.parse is sync by default; the cast is just to satisfy
  // TypeScript inference (marked types `parse` as `string | Promise<string>`
  // because of the `async: true` option, which we don't use).
  const out = /** @type {string} */ (md.parse(text));
  return out.trim();
}

/**
 * HTML-text/attribute-safe escape. Used in two places:
 *
 *   - `link()` renderer: sanitizes `href` and `title` attribute
 *     values (the markdown source contributes them verbatim, so we
 *     escape `"` to keep an attacker from breaking out of the
 *     attribute quote).
 *
 *   - `html()` renderer: escapes the entire text of an HTML token so
 *     it renders as literal text rather than being parsed by the
 *     browser. This is the safety boundary that mirrors
 *     `markdown-it`'s `html: false`.
 *
 * Standard five-char HTML escape; sufficient for both contexts.
 *
 * @param {string} s
 */
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
