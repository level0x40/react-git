import { getBlob, getHeadRef, getProject, getTree, resolvePath } from "@level0x40/react-git/source";
import FileBrowser from "virtual:rg/component/FileBrowser";
import BlobView from "virtual:rg/component/BlobView";
import FileIcon from "virtual:rg/component/FileIcon";

/**
 * `/files/<path...>` — unified route for both deep tree listings and
 * blob views. We resolve the path against the ref's tree index, then
 * dispatch on `kind`. Splitting this into separate /tree and /blob
 * routes was tempting but the URL space is small enough that a runtime
 * dispatch keeps cross-references (breadcrumbs, sibling links) simpler.
 *
 * @param {{ path: string[] }} props
 */
export default async function FilesPathPage({ path }) {
  const [project, ref] = await Promise.all([getProject(), getHeadRef()]);
  const joined = path.join("/");
  const entry = await resolvePath(ref, joined);

  if (!entry) {
    return (
      <main className="rg-main">
        <header className="rg-crumbs">
          <a href="/">{project.name}</a>
          <span aria-hidden="true">/</span>
          <a href="/files">files</a>
          <span aria-hidden="true">/</span>
          <span>{joined}</span>
        </header>
        <p className="rg-error">
          Path not found at {ref}: {joined}
        </p>
      </main>
    );
  }

  return (
    <main className="rg-main">
      <Crumbs project={project} segments={path} leafKind={entry.kind} />
      {entry.kind === "tree" ? (
        <FileBrowser tree={await getTree(ref, joined)} />
      ) : (
        <BlobView file={await getBlob(entry.sha, { ref, path: joined })} />
      )}
    </main>
  );
}

/**
 * Breadcrumbs that are clickable up to (but not including) the leaf.
 * Each segment links to its enclosing tree, so navigating "up" from a
 * deep file is one click per level. The leaf segment carries an icon
 * that reflects what's at that path — folder for trees, type-aware
 * file glyph (.ts → TS, package.json → package, .gitignore → git…)
 * for blobs. Intermediate segments stay text-only to keep the crumb
 * line readable on deep paths.
 *
 * @param {{
 *   project: import("@level0x40/react-git/source").SourceProject,
 *   segments: string[],
 *   leafKind: "tree" | "blob",
 * }} props
 */
function Crumbs({ project, segments, leafKind }) {
  const crumbs = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const slice = segments.slice(0, i + 1).join("/");
    // Yield link + separator as two siblings of the parent
    // `.rg-crumbs` flex row, NOT wrapped in an outer `<span>`.
    // A wrapper would defeat the flex `gap` between the link and
    // the separator (and between the separator and the next
    // segment) — see `tree/[refSlug]/[...path].page.jsx` for the
    // matching fix.
    crumbs.push(
      <a key={`l-${i}-a`} href={`/files/${slice}`}>
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
      <a href="/files">files</a>
      <span aria-hidden="true">/</span>
      {crumbs}
      <span className="rg-crumbs-leaf">
        <FileIcon
          kind={leafKind === "tree" ? "tree" : "blob"}
          name={leafKind === "blob" ? last : undefined}
        />
        <span>{last}</span>
      </span>
    </header>
  );
}
