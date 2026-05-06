// Cross-component imports go through the virtual indirection so a
// user template that overrides CommitLink or FileIcon takes effect
// transitively here (CommitList renders the user's CommitLink, not
// the built-in one). The plugin in `src/runtime/template-plugin.js`
// resolves these to the user's file if present, else the built-in
// impl.
import CommitLink from "virtual:rg/component/CommitLink";
import FileIcon from "virtual:rg/component/FileIcon";

import Streamed from "./Streamed.jsx";

/**
 * Shared commit-list renderer used by `/log`, `/log/<ref>`, and the
 * overview page (via the `recent commits` excerpt). Click-anywhere row,
 * commit-marker icon + SHA chip on the left, author + date on the right.
 *
 * Each row renders TWO `CommitLink`s pointing at the same sha — one for
 * the SHA chip, one for the subject. `CommitLink` collapses to plain
 * `<span>` when the target page isn't in the static-export scope, so a
 * row whose commit lies beyond `--max-commits` still appears (the SHA
 * remains informative) but doesn't dangle a broken anchor.
 *
 * @param {{ commits: readonly import("@level0x40/react-git/source").SourceCommit[] }} props
 */
export default function CommitList({ commits }) {
  return (
    <ol className="rg-commit-list">
      <Streamed items={commits}>
        {(commit) => (
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
        )}
      </Streamed>
    </ol>
  );
}
