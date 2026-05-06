import { getCommit, getProject, listCommitShasByRef, slugToRef } from "@level0x40/react-git/source";
import CommitList from "virtual:rg/component/CommitList";

/**
 * `/log/<ref>` — commit history reachable from a specific ref's tip,
 * bounded by `--max-commits`.
 *
 * The route segment is `[refSlug]` (not `[ref]`) on purpose: the
 * file router spreads matched params onto the page element via
 * `React.createElement(Page, params)`. A param key literally named
 * `ref` ends up as the page element's `ref` prop, which trips React
 * 19's "Accessing element.ref was removed" deprecation warning when
 * the RSC machinery later inspects the element. Naming the segment
 * `refSlug` keeps `ref` out of the props bag entirely.
 *
 * @param {{ refSlug: string }} props
 */
export default async function LogRefPage({ refSlug }) {
  const refName = slugToRef(refSlug);
  const project = await getProject();
  const shas = await listCommitShasByRef(refName);
  const commits = await Promise.all(shas.map((s) => getCommit(s)));
  return (
    <main className="rg-main">
      <header className="rg-crumbs">
        <a href="/">{project.name}</a>
        <span aria-hidden="true">/</span>
        <a href="/log">log</a>
        <span aria-hidden="true">/</span>
        <span className="rg-ref-name">{refName}</span>
      </header>
      <CommitList commits={commits} />
    </main>
  );
}
