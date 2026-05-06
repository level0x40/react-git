import { isCommitEmitted } from "@level0x40/react-git/source";

/**
 * Render a commit reference as an anchor when the commit page is in the
 * static-export scope, otherwise as plain text. Keeps the rendered HTML
 * self-consistent — every emitted `<a href>` resolves to a real file on
 * disk, so the deploy serves cleanly under any plain static host
 * (Python's http.server, nginx, S3, …) without 404s on out-of-scope
 * commit links.
 *
 * Per-ref commit indices can extend past the global `--max-commits` cap
 * (e.g. a tag's tip lands in `commits/<sha>.json` even when it's beyond
 * the global emission set). Without this gate, log views for those refs
 * would emit links that 404 in static deploys; with it, the SHA chip
 * stays informative but unclickable.
 *
 * Server-only on purpose: the predicate reads the data layer and is
 * cheap (cached). Pushing this to the client would cost an additional
 * hydration round-trip for state that's invariant for a given build.
 *
 * @param {{
 *   sha: string,
 *   className?: string,
 *   title?: string,
 *   children: import("react").ReactNode,
 * }} props
 */
export default async function CommitLink({ sha, className, title, children }) {
  const emitted = await isCommitEmitted(sha);
  if (!emitted) {
    // Plain-text fallback. The same className passes through so the
    // rendered SHA / subject / chip styling is preserved minus the
    // anchor affordance (no underline, no pointer cursor).
    return (
      <span className={className} title={title}>
        {children}
      </span>
    );
  }
  return (
    <a href={`/commit/${sha}`} className={className} title={title}>
      {children}
    </a>
  );
}
