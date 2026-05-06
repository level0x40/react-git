/**
 * tui FileIcon — text glyphs in place of colored SVG chips.
 *
 * The default impl emits 16×16 SVGs for every kind. That reads as
 * decoration in a terminal aesthetic (real `tig` or `ls -F` doesn't
 * paint colored squares). This override returns plain `<span>`s
 * carrying a one-or-two-character glyph for kinds that need a list-
 * marker (file-browser rows), and `null` for kinds where the
 * surrounding label or content already says everything (nav links,
 * commit-list metadata, crumbs).
 *
 * Glyph choices follow `tig`/`lazygit` conventions:
 *
 *   tree (folder)        → ▸     (right-pointing pointer = expandable)
 *   blob (file)          → ·     (mid-dot = leaf)
 *   commit (submodule)   → ⊕     (circled-plus = "another repo here")
 *   up (parent link)     → ↑     (arrow up)
 *
 * The FileBrowser renders `<FileIcon ... /><span>name</span>` so a
 * one-char glyph is enough — the column already aligns on `name`.
 *
 * Empty-glyph kinds (nav, commit-meta) return `null`. The default
 * impl's `name`-based file-type dispatch (jsx vs ts vs png glyph) is
 * intentionally ignored — TUI doesn't differentiate file types
 * through the icon column. Filename extensions in the row text
 * carry that information.
 *
 * No named exports: the default impl re-exports `fileKindFor` as a
 * convenience, but no consumers reach outside the FileIcon module
 * itself, so dropping it here is safe (the skeleton's `export *`
 * forwards nothing — also fine).
 *
 * @param {{ kind: string, name?: string }} props
 */
const KIND_GLYPH = /** @type {Record<string, string>} */ ({
  tree: "▸", // ▸
  blob: "·", // ·
  commit: "⊕", // ⊕  (submodule)
  up: "↑", // ↑
});

/**
 * @param {{ kind: string, name?: string }} props
 */
export default function FileIcon({ kind }) {
  const glyph = KIND_GLYPH[kind];
  if (!glyph) return null;
  return (
    <span className="rg-glyph rg-glyph-text" aria-hidden="true">
      {glyph}
    </span>
  );
}
