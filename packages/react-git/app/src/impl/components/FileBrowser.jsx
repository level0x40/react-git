// Cross-component import via the virtual indirection — user-overridden
// FileIcon wins. See template-plugin.js for resolution order.
import FileIcon from "virtual:rg/component/FileIcon";

/**
 * Two-column directory listing — name + size, sorted with directories
 * first. Submodule entries (kind="commit") are surfaced as muted
 * non-link rows because their content lives in another repo we don't
 * follow yet.
 *
 * `treeBaseHref` controls the URL space child links resolve into. The
 * default `/files` matches the HEAD shortcut routes; non-HEAD refs
 * pass `/tree/<ref-slug>` so the same component reuses across both
 * route trees without per-page link rewriting.
 *
 * `linkable` gates whether entries render as anchors. The static
 * enumerator only emits deep `/tree/<ref>/<path>` URLs for refs in
 * `REACT_GIT_BROWSE_REFS`; for refs outside that set, the deep paths
 * don't exist on disk and an `<a>` would 404 under any plain static
 * host. We render the same row layout (icon + name + size) but as
 * plain text — the listing remains informative without dangling broken
 * links. The default `true` covers the common case (HEAD/`/files`,
 * which is always emitted).
 *
 * @param {{
 *   tree: import("@level0x40/react-git/source").SourceTree,
 *   treeBaseHref?: string,
 *   linkable?: boolean,
 * }} props
 */
export default function FileBrowser({ tree, treeBaseHref = "/files", linkable = true }) {
  const sorted = [...tree.entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "tree" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <table className="rg-tree">
      <thead>
        <tr>
          <th>Name</th>
          <th>Size</th>
        </tr>
      </thead>
      <tbody>
        {tree.path !== "" ? (
          <tr className="rg-tree-row rg-tree-up">
            <td>
              {/* Parent link is only safe to render when ascending stays
                  in scope. For non-linkable trees we'd be rendering this
                  at root anyway (deep paths aren't emitted), so the
                  branch is mostly defensive. */}
              {linkable ? (
                <a href={parentHref(tree.path, treeBaseHref)} className="rg-tree-name">
                  <FileIcon kind="up" />
                  <span>..</span>
                </a>
              ) : (
                <span className="rg-tree-name">
                  <FileIcon kind="up" />
                  <span>..</span>
                </span>
              )}
            </td>
            <td></td>
          </tr>
        ) : null}
        {sorted.map((entry) => (
          <tr key={entry.path} className="rg-tree-row">
            <td>
              {entry.kind === "commit" ? (
                <span className="rg-tree-name rg-tree-submodule">
                  <FileIcon kind="commit" />
                  <span>{entry.name}</span>
                </span>
              ) : linkable ? (
                <a href={`${treeBaseHref}/${entry.path}`} className="rg-tree-name">
                  <FileIcon kind={entry.kind} name={entry.name} />
                  <span>{entry.name}</span>
                </a>
              ) : (
                <span className="rg-tree-name rg-tree-static">
                  <FileIcon kind={entry.kind} name={entry.name} />
                  <span>{entry.name}</span>
                </span>
              )}
            </td>
            <td className="rg-tree-size">{entry.kind === "blob" ? formatBytes(entry.size) : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * @param {string} path
 * @param {string} base   `/files` for the HEAD shortcut, `/tree/<slug>` for a ref-scoped tree
 */
function parentHref(path, base) {
  const slash = path.lastIndexOf("/");
  if (slash < 0) return base;
  return `${base}/${path.slice(0, slash)}`;
}

/** @param {number} bytes */
function formatBytes(bytes) {
  if (bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

// Per-entry icon dispatch lives in `./FileIcon.jsx` — covers folder,
// submodule, parent-link, and ~25 distinct file-type glyphs (js/ts/
// jsx/tsx/json/html/css/markdown/image/lock/git/env/etc.) routed via
// the entry's filename.
