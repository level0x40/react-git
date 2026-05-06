import {
  getCommit,
  getHeadRef,
  getProject,
  listCommitShasByRef,
  refToSlug,
} from "@level0x40/react-git/source";
import CommitList from "virtual:rg/component/CommitList";

/**
 * `/log` — full commit history at the default branch (HEAD), bounded
 * by `--max-commits`. The same data is excerpted on the overview;
 * this page exists so users have a stable URL for "the log".
 */
export default async function LogIndexPage() {
  const [project, ref] = await Promise.all([getProject(), getHeadRef()]);
  const shas = await listCommitShasByRef(ref);
  const commits = await Promise.all(shas.map((s) => getCommit(s)));
  return (
    <main className="rg-main">
      <header className="rg-crumbs">
        <a href="/">{project.name}</a>
        <span aria-hidden="true">/</span>
        <span>log</span>
        <span aria-hidden="true">/</span>
        <a href={`/log/${refToSlug(ref)}`} className="rg-ref-name">
          {ref}
        </a>
      </header>
      <CommitList commits={commits} />
    </main>
  );
}
