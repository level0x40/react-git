/**
 * Wrapper-demo FileIcon — wraps the package's built-in FileIcon
 * with a magenta dashed outline + a `title` tooltip exposing the
 * `kind` prop, so each call site is visually labelled in dev.
 *
 * The point of this template:
 *
 *   - Custom templates resolved via `--template <path>` can import
 *     ORIGINAL components from the package and compose with them,
 *     not just replace them. This file imports
 *     `@level0x40/react-git/impl/components/FileIcon.jsx` — the
 *     package's package-export route into the impl tree — and
 *     forwards every prop through.
 *
 *   - The historical alias-based template scheme (now retired)
 *     would have looped here: an alias `react-git/impl/.../FileIcon`
 *     → user's wrapper file → user wraps `react-git/impl/.../FileIcon`
 *     → loop. The current template-plugin scheme avoids that by
 *     having the user's wrapper register at
 *     `virtual:rg/component/FileIcon` (the indirection consumers
 *     import from), while the package export
 *     `@level0x40/react-git/impl/...` skips the indirection and
 *     resolves directly to the impl file. No alias, no cycle.
 *
 * Resolution path the bundler walks for this file's imports:
 *
 *   import OriginalFileIcon from "@level0x40/react-git/impl/components/FileIcon.jsx"
 *     ↓ Node self-referential package resolution (or installed
 *       node_modules/@level0x40/react-git when consumed externally)
 *   ↓
 *   <package-root>/package.json `exports`
 *     "./impl/*": "./app/src/impl/*"
 *   ↓
 *   <package-root>/app/src/impl/components/FileIcon.jsx
 *
 * Every consumer that imports `virtual:rg/component/FileIcon`
 * (FileBrowser, CommitList, DiffView summary, breadcrumb leaf,
 * HUD nav) gets THIS wrapper, which renders the original inside
 * a `<span>` with debug styling. The surrounding page chrome is
 * the standard `default` theme — this template ships no
 * `src/styles/main.css`, so the template-plugin's tier-2 fallback
 * resolves `virtual:rg/style/main` to
 * `app/templates/default/src/styles/main.css` (instead of falling
 * all the way through to the bare `app/src/impl` reset).
 *
 * Why a path-prop type on `kind` matches the original — this
 * wrapper does no narrowing of its own; `kind` and `name` flow
 * straight through to the original's dispatch table.
 *
 * @param {{
 *   kind: "tree" | "blob" | "commit" | "up"
 *       | "branch" | "tag" | "git-commit" | "clock" | "user" | "home"
 *       | "log" | "refs" | "files" | "tags",
 *   name?: string,
 * }} props
 */
import OriginalFileIcon from "@level0x40/react-git/impl/components/FileIcon.jsx";

export default function FileIcon(props) {
  return (
    <span
      // Inline styles, not a class — the template ships no
      // stylesheet override (`virtual:rg/style/main` falls through
      // to the built-in `default` template's CSS via tier 2 of the
      // template-plugin lookup). Keeping the wrapper styling
      // inline means the magenta-outline signal works regardless
      // of which host stylesheet provides the surrounding chrome,
      // so this wrapper-demo template stays self-contained: drop it
      // on top of ANY active stylesheet and the wrapper effect is
      // unmistakable.
      style={{
        outline: "1px dashed magenta",
        outlineOffset: "1px",
        borderRadius: "3px",
        // Inline-block lets the outline hug the icon glyph without
        // extending across the surrounding inline text baseline.
        display: "inline-block",
        lineHeight: 0,
      }}
      title={`FileIcon kind=${props.kind}${props.name ? ` name=${props.name}` : ""}`}
    >
      <OriginalFileIcon {...props} />
    </span>
  );
}
