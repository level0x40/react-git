import { getBlob, getProject, getTree, resolvePath, slugToRef } from "@level0x40/react-git/source";
import FileBrowser from "virtual:rg/component/FileBrowser";
import BlobView from "virtual:rg/component/BlobView";
import FileIcon from "virtual:rg/component/FileIcon";

/**
 * `/tree/<ref>/<path...>` — unified tree-or-blob view for any ref.
 * Mirrors `/files/[...path]` but parameterized on `ref` so non-default
 * branches and tags get full file browsing.
 *
 * The route segment is `[refSlug]` (not `[ref]`) so the file router
 * never spreads a prop literally named `ref` onto this page element.
 * `ref` is React's reserved attribute name; spreading it via
 * `React.createElement(Page, params)` (which the file router does
 * internally) trips React 19's "Accessing element.ref was removed"
 * deprecation warning when the RSC machinery later inspects the
 * element — even though the page itself never forwards `ref`. The
 * segment was renamed at the file-system level so `ref` never
 * appears as a prop name anywhere in the route's params bag.
 *
 * @param {{ refSlug: string, path: string[] }} props
 */
export default async function TreeRefPathPage({ refSlug, path }) {
  const refName = slugToRef(refSlug);
  const project = await getProject();
  const joined = path.join("/");
  const entry = await resolvePath(refName, joined);

  if (!entry) {
    return (
      <main className="rg-main">
        <Crumbs
          project={project}
          refSlug={refSlug}
          refName={refName}
          segments={path}
          leafKind={null}
        />
        <p className="rg-error">
          Path not found at {refName}: {joined}
        </p>
      </main>
    );
  }

  return (
    <main className="rg-main">
      <Crumbs
        project={project}
        refSlug={refSlug}
        refName={refName}
        segments={path}
        leafKind={entry.kind === "tree" ? "tree" : "blob"}
      />
      {entry.kind === "tree" ? (
        <FileBrowser tree={await getTree(refName, joined)} treeBaseHref={`/tree/${refSlug}`} />
      ) : (
        <BlobView file={await getBlob(entry.sha, { ref: refName, path: joined })} />
      )}
    </main>
  );
}

/**
 * Crumbs that climb the path tree, one click per segment, with the
 * leaf rendered as a single labeled chip. The first three segments
 * are always: project → tree → ref. The leaf carries an icon that
 * reflects what's at that path (folder for trees, type-aware file
 * glyph for blobs).
 *
 * @param {{
 *   project: import("@level0x40/react-git/source").SourceProject,
 *   refSlug: string,
 *   refName: string,
 *   segments: string[],
 *   leafKind: "tree" | "blob" | null,
 * }} props
 */
function Crumbs({ project, refSlug, refName, segments, leafKind }) {
  const inner = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const slice = segments.slice(0, i + 1).join("/");
    // Yield the link and its trailing separator as two siblings of
    // the parent `.rg-crumbs` flex row — NOT wrapped in an outer
    // `<span>`. A wrapper would put both children in their own inline
    // box, defeating the flex `gap: 8px` between the link and the
    // separator (and between the separator and the next segment).
    inner.push(
      <a key={`l-${i}-a`} href={`/tree/${refSlug}/${slice}`}>
        {segments[i]}
      </a>,
      <span key={`l-${i}-sep`} aria-hidden="true">
        /
      </span>,
    );
  }
  const last = segments[segments.length - 1];
  return (
    <header className="rg-crumbs">
      <a href="/">{project.name}</a>
      <span aria-hidden="true">/</span>
      <a href="/refs">tree</a>
      <span aria-hidden="true">/</span>
      <a href={`/tree/${refSlug}`} className="rg-ref-name">
        {refName}
      </a>
      <span aria-hidden="true">/</span>
      {inner}
      {leafKind ? (
        <span className="rg-crumbs-leaf">
          <FileIcon
            kind={leafKind === "tree" ? "tree" : "blob"}
            name={leafKind === "blob" ? last : undefined}
          />
          <span>{last}</span>
        </span>
      ) : (
        <span>{last}</span>
      )}
    </header>
  );
}
