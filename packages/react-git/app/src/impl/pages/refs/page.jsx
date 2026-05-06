import { getProject, listRefs, refToSlug } from "@level0x40/react-git/source";
import CommitLink from "virtual:rg/component/CommitLink";
import FileIcon from "virtual:rg/component/FileIcon";

import Streamed from "../../components/Streamed.jsx";

/**
 * `/refs` — all refs grouped by kind. Branches link to their tree
 * root + log; tags link to the same. Tags also surface on `/tags` for
 * users who want them isolated.
 */
export default async function RefsPage() {
  const [project, refs] = await Promise.all([getProject(), listRefs()]);
  const branches = refs.filter((r) => r.kind === "branch");
  const tags = refs.filter((r) => r.kind === "tag");

  return (
    <main className="rg-main">
      <header className="rg-crumbs">
        <a href="/">{project.name}</a>
        <span aria-hidden="true">/</span>
        <span>refs</span>
      </header>

      <RefSection title="Branches" entries={branches} icon="branch" />
      <RefSection title="Tags" entries={tags} icon="tag" />
    </main>
  );
}

/**
 * @param {{
 *   title: string,
 *   entries: readonly import("@level0x40/react-git/source").SourceRef[],
 *   icon: "branch" | "tag",
 * }} props
 */
function RefSection({ title, entries, icon }) {
  if (entries.length === 0) return null;
  return (
    <section className="rg-section">
      <h2>{title}</h2>
      <table className="rg-tree">
        <tbody>
          <Streamed items={entries}>
            {(r) => (
              <tr key={r.fullName} className="rg-tree-row">
                <td>
                  <a href={`/tree/${refToSlug(r.shortName)}`} className="rg-tree-name">
                    <FileIcon kind={icon} />
                    <span className="rg-ref-name">{r.shortName}</span>
                    {r.isHead ? <span className="rg-ref-head-badge">HEAD</span> : null}
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
    </section>
  );
}
