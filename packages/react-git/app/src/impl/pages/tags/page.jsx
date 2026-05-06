import { getProject, listRefs, refToSlug } from "@level0x40/react-git/source";
import CommitLink from "virtual:rg/component/CommitLink";
import FileIcon from "virtual:rg/component/FileIcon";

import Streamed from "../../components/Streamed.jsx";

/**
 * `/tags` — tags-only view. Same data shape as `/refs` but filtered.
 * Sorted in reverse so newest tags appear first when names follow a
 * lexicographic versioning scheme (semver, calver) — falls back to
 * stable order otherwise.
 */
export default async function TagsPage() {
  const [project, refs] = await Promise.all([getProject(), listRefs()]);
  const tags = refs
    .filter((r) => r.kind === "tag")
    .sort((a, b) => b.shortName.localeCompare(a.shortName, undefined, { numeric: true }));

  return (
    <main className="rg-main">
      <header className="rg-crumbs">
        <a href="/">{project.name}</a>
        <span aria-hidden="true">/</span>
        <span>tags</span>
      </header>

      {tags.length === 0 ? (
        <p className="rg-blob-empty">No tags in this repository.</p>
      ) : (
        <table className="rg-tree">
          <tbody>
            <Streamed items={tags}>
              {(r) => (
                <tr key={r.fullName} className="rg-tree-row">
                  <td>
                    <a href={`/tree/${refToSlug(r.shortName)}`} className="rg-tree-name">
                      <FileIcon kind="tag" />
                      <span className="rg-ref-name">{r.shortName}</span>
                    </a>
                  </td>
                  <td className="rg-tree-size">
                    <a href={`/log/${refToSlug(r.shortName)}`} className="rg-muted-inline">
                      log
                    </a>
                    <span aria-hidden="true"> · </span>
                    <CommitLink sha={r.sha}>
                      <code className="rg-sha">{r.sha.slice(0, 8)}</code>
                    </CommitLink>
                  </td>
                </tr>
              )}
            </Streamed>
          </tbody>
        </table>
      )}
    </main>
  );
}
