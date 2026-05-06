import { getProject, getTree, isRefBrowsable, slugToRef } from "@level0x40/react-git/source";
import FileBrowser from "virtual:rg/component/FileBrowser";

/**
 * `/tree/<ref>` — root directory listing for any ref. Path-having
 * variants live in `[...path].page.jsx`.
 *
 * The root tree page is emitted for every extracted ref so the
 * refs/tags pages always link to a real file. But deep
 * `/tree/<ref>/<path>` URLs are only emitted for refs in the
 * browse-set (`REACT_GIT_BROWSE_REFS`, default = HEAD only). For refs
 * outside that set, the FileBrowser still renders the directory
 * listing but as plain text — clicking an entry would 404 in static
 * deploys, so we don't pretend it's clickable. A short notice tells
 * the user how to opt in.
 *
 * The route segment is `[refSlug]` rather than `[ref]` so the file
 * router never spreads a param literally named `ref` onto the page
 * element — that would trip React 19's "Accessing element.ref was
 * removed" deprecation warning during RSC element inspection.
 *
 * @param {{ refSlug: string }} props  ref slug from URL — `__` decoded back to `/`
 */
export default async function TreeRefIndexPage({ refSlug }) {
  const refName = slugToRef(refSlug);
  const [project, tree, browsable] = await Promise.all([
    getProject(),
    getTree(refName, ""),
    isRefBrowsable(refName),
  ]);
  return (
    <main className="rg-main">
      <header className="rg-crumbs">
        <a href="/">{project.name}</a>
        <span aria-hidden="true">/</span>
        <a href="/refs">tree</a>
        <span aria-hidden="true">/</span>
        <span className="rg-ref-name">{refName}</span>
      </header>
      {browsable ? null : (
        <p className="rg-static-notice">
          Deep file browsing is not enabled for this ref. Set <code>REACT_GIT_BROWSE_REFS</code> to
          include <code>{refName}</code> (or <code>*</code> for every ref) to generate per-file
          pages on the next build.
        </p>
      )}
      <FileBrowser tree={tree} treeBaseHref={`/tree/${refSlug}`} linkable={browsable} />
    </main>
  );
}
