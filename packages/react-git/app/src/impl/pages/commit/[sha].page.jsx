import { Suspense } from "react";
import { getCommit, getDiff, getProject } from "@level0x40/react-git/source";
import CommitLink from "virtual:rg/component/CommitLink";
import DiffView from "virtual:rg/component/DiffView";
import {
  DiffBodyShell,
  DiffViewProvider,
  DiffViewToggle,
} from "virtual:rg/component/DiffViewClient";
import FileIcon from "virtual:rg/component/FileIcon";

/**
 * `/commit/<sha>` — single commit view: header (subject, author, date,
 * SHAs), full body, file-change summary, and a unified diff per
 * changed file.
 *
 * @param {{ sha: string }} props
 */
export default async function CommitPage({ sha }) {
  const [project, commit, diff] = await Promise.all([getProject(), getCommit(sha), getDiff(sha)]);

  const totals = diff.files.reduce(
    (acc, f) => ({
      additions: acc.additions + f.additions,
      deletions: acc.deletions + f.deletions,
    }),
    { additions: 0, deletions: 0 },
  );

  return (
    <main className="rg-main">
      <header className="rg-crumbs">
        <a href="/">{project.name}</a>
        <span aria-hidden="true">/</span>
        <span>commit</span>
        <span aria-hidden="true">/</span>
        <code className="rg-sha">{sha.slice(0, 12)}</code>
      </header>

      <article className="rg-commit-detail">
        <h1 className="rg-commit-subject">{commit.subject}</h1>
        {/* `bodyHtml` is rendered server-side from `commit.body` via
            markdown-it (html: false → inline HTML escaped). Safe to
            inject. Falls back to "" when the body is empty, so the
            null check covers both "no body" and "all-whitespace
            body" cases. */}
        {commit.bodyHtml ? (
          <div
            className="rg-commit-body rg-prose"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: commit.bodyHtml }}
          />
        ) : null}

        <dl className="rg-commit-meta">
          <div>
            <dt>Author</dt>
            <dd>
              {commit.author.name}{" "}
              <span className="rg-muted-inline">
                &lt;
                <a href={`mailto:${commit.author.email}`} className="rg-muted-inline">
                  {commit.author.email}
                </a>
                &gt;
              </span>
            </dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>
              <time dateTime={commit.author.date}>{commit.author.date}</time>
            </dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd>
              <code className="rg-sha">{commit.sha}</code>
            </dd>
          </div>
          {commit.parents.length > 0 ? (
            <div>
              <dt>{commit.parents.length > 1 ? "Parents" : "Parent"}</dt>
              <dd>
                {commit.parents.map((p, idx) => (
                  <span key={p}>
                    {idx > 0 ? ", " : null}
                    {/* Parents may sit beyond `--max-commits` — e.g.
                        the merge-base of a long-running branch — so
                        we route through `CommitLink`, which falls
                        back to plain text when the parent's page
                        isn't in the static-export scope. */}
                    <CommitLink sha={p}>
                      <code className="rg-sha">{p.slice(0, 12)}</code>
                    </CommitLink>
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </article>

      <section className="rg-diff-summary">
        <header>
          <span className="rg-diff-summary-count">
            {diff.files.length} file{diff.files.length === 1 ? "" : "s"} changed
          </span>
          <span className="rg-diff-summary-stats">
            <span className="rg-add">+{totals.additions}</span>{" "}
            <span className="rg-rem">-{totals.deletions}</span>
          </span>
        </header>
        <ul>
          {diff.files.map((f) => {
            const path = f.pathAfter ?? f.pathBefore ?? "";
            // Use the *basename* (last segment) for icon dispatch —
            // "src/foo/package.json" should still get the package
            // icon, not a generic file glyph.
            const basename = path.slice(path.lastIndexOf("/") + 1);
            return (
              <li key={diffFileKey(f)}>
                <a href={`#diff-${diffFileKey(f)}`}>
                  <FileBadge mode={f.mode} />
                  <FileIcon kind="blob" name={basename} />
                  <code>{path}</code>
                </a>
                <span className="rg-diff-summary-stats">
                  <span className="rg-add">+{f.additions}</span>{" "}
                  <span className="rg-rem">-{f.deletions}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* View choice is plain client state with localStorage
          persistence. URL is intentionally NOT involved — a Link
          here would refetch the route's RSC payload on every toggle
          click, which is wasted work for a static deployment where
          the same payload is already in memory and identical for
          both views.

          Both subtrees are rendered server-side and shipped in the
          RSC payload; the client shell mounts whichever context
          selects. The toggle saves/restores scroll position across
          the swap.

          Per-file <Suspense> is the streaming-flush boundary that
          keeps each file under React's 512 KB single-chunk threshold
          during SSG. Fallback is null because diff data is fully
          resolved at render time — the boundary is purely a flush
          hint, not a wait state. */}
      <DiffViewProvider>
        <div className="rg-diff-controls">
          <DiffViewToggle />
        </div>

        <DiffBodyShell
          inline={
            <section className="rg-diff-files">
              {diff.files.map((file) => (
                <Suspense key={diffFileKey(file)} fallback={null}>
                  <DiffView file={file} variant="inline" commitSha={commit.sha} />
                </Suspense>
              ))}
            </section>
          }
          split={
            <section className="rg-diff-files">
              {diff.files.map((file) => (
                <Suspense key={diffFileKey(file)} fallback={null}>
                  <DiffView file={file} variant="split" commitSha={commit.sha} />
                </Suspense>
              ))}
            </section>
          }
        />
      </DiffViewProvider>
    </main>
  );
}

/** @param {import("@level0x40/react-git/source").SourceDiffFile} file */
function diffFileKey(file) {
  // Stable id for in-page anchors. Renames/copies use the new path so
  // multiple unrelated files never collide; pure deletions fall back to
  // the old path.
  const path = file.pathAfter ?? file.pathBefore ?? "unknown";
  return path.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** @param {{ mode: import("@level0x40/react-git/source").SourceDiffFileMode }} props */
function FileBadge({ mode }) {
  const label =
    mode === "added"
      ? "A"
      : mode === "deleted"
        ? "D"
        : mode === "renamed"
          ? "R"
          : mode === "copied"
            ? "C"
            : "M";
  return <span className={`rg-file-badge rg-file-badge-${mode}`}>{label}</span>;
}
