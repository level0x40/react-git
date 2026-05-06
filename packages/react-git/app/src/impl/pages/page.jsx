import {
  getProject,
  listCommitCalendar,
  listCommits,
  listRefs,
  refToSlug,
} from "@level0x40/react-git/source";
import CommitCalendar from "virtual:rg/component/CommitCalendar";
import CommitLink from "virtual:rg/component/CommitLink";
import FileIcon from "virtual:rg/component/FileIcon";

export default async function OverviewPage() {
  const [project, refs, commits, calendar] = await Promise.all([
    getProject(),
    listRefs(),
    listCommits(),
    listCommitCalendar(),
  ]);

  const head = refs.find((r) => r.isHead) ?? null;
  const branchCount = refs.filter((r) => r.kind === "branch").length;
  const tagCount = refs.filter((r) => r.kind === "tag").length;

  return (
    <main className="rg-overview">
      <header className="rg-header">
        <h1 className="rg-title">{project.name}</h1>
        {project.description ? <p className="rg-description">{project.description}</p> : null}
        <dl className="rg-meta">
          <div>
            <dt>HEAD</dt>
            <dd>
              <CommitLink sha={project.headSha}>
                <code>{project.headSha.slice(0, 12)}</code>
              </CommitLink>
              {head ? (
                <span>
                  {" on "}
                  <a href={`/log/${refToSlug(head.shortName)}`}>{head.shortName}</a>
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Branches</dt>
            <dd>
              <a href="/refs">{branchCount}</a>
            </dd>
          </div>
          <div>
            <dt>Tags</dt>
            <dd>
              <a href="/tags">{tagCount}</a>
            </dd>
          </div>
        </dl>
      </header>

      <CommitCalendar data={calendar} />

      <section className="rg-section">
        <h2>Recent commits</h2>
        <ol className="rg-commit-list">
          {commits.map((commit) => (
            <li key={commit.sha} className="rg-commit">
              <CommitLink sha={commit.sha} className="rg-sha rg-commit-link">
                <FileIcon kind="git-commit" />
                <span>{commit.sha.slice(0, 8)}</span>
              </CommitLink>
              <CommitLink sha={commit.sha} className="rg-subject rg-commit-link">
                {commit.subject}
              </CommitLink>
              <span className="rg-author">
                <FileIcon kind="user" />
                <span>{commit.author.name}</span>
              </span>
              <time dateTime={commit.author.date}>
                <FileIcon kind="clock" />
                <span>{commit.author.date.slice(0, 10)}</span>
              </time>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
