import {
  getDiff,
  listAllPaths,
  listCommitShas,
  listRefs,
  refToSlug,
  resolveBrowseSet,
  shouldEmit,
} from "@level0x40/react-git/source/build";

/**
 * Refs whose deep file paths get prerendered for `/tree/<ref>/<path...>`.
 * Default: HEAD only. Set `REACT_GIT_BROWSE_REFS` to override
 * (comma-separated short-names, or `*` for every extracted ref).
 *
 * Resolution lives in the runtime (`resolveBrowseSet`) so render-time
 * link sites can consult the same set and avoid emitting links to
 * paths that aren't in the static export.
 *
 * `/log/<ref>`, `/refs`, and `/tags` continue to enumerate every
 * extracted ref regardless of this setting; this flag only gates the
 * (potentially huge) per-file paths under `/tree/<ref>/<path...>`.
 */

/**
 * Enumerate `(ref, path)` pairs for `/tree/<ref>/<path...>`. The
 * empty path is skipped because it's served by the sibling
 * `page.jsx` route — leaving it here would emit two HTML files for
 * the same URL and trip react-server's "Page not found" guard.
 *
 * Streaming form: yields one descriptor at a time. This is the route
 * with the largest cardinality (browse-set × tree size, plus
 * per-commit changed paths in live mode), and the streaming form lets
 * the exporter start rendering as soon as the first `(ref, path)` is
 * enumerated. Peak memory stays at O(one descriptor + the dedup-key
 * set) rather than O(all entries).
 *
 * Output combines two sources, yielded in this order:
 *
 *   1. **Browse-ref paths** — every path under each ref in
 *      `REACT_GIT_BROWSE_REFS` (default: HEAD only). This powers the
 *      "click to navigate" tree browser.
 *
 *   2. **Per-commit changed paths** — for every commit in scope,
 *      one entry per non-deleted changed file at the commit's SHA.
 *      This powers the "open file at this commit" link in
 *      `DiffView` — clicking a path in commit X's diff opens the
 *      file as it was at X, not at HEAD. Without this, those URLs
 *      would 404 in static export.
 *
 *      Limited to *changed* files (not the full tree at each
 *      commit) to keep the route count linear in total churn rather
 *      than `commits × tree-size`. A 50-commit history with 5 files
 *      changed per commit is ~250 extra routes; bounded and small
 *      relative to the browse-ref enumeration.
 *
 *      Deleted files are omitted: `/tree/<sha>/<deleted-path>`
 *      legitimately 404s — the file is gone at that commit.
 */
export default async function* staticPaths() {
  const allRefs = await listRefs();
  const browseSet = await resolveBrowseSet();

  /** Dedup: a (sha, path) pair could theoretically appear twice via
   *  the browse-ref pass + per-commit pass if a SHA happens to match
   *  a ref shortName (rare but possible). Keep the first sighting. */
  const seen = new Set();

  // 1. Browse-ref paths.
  for (const ref of allRefs) {
    if (!browseSet.has(ref.shortName)) continue;
    const paths = await listAllPaths(ref.shortName);
    const slug = refToSlug(ref.shortName);
    for (const p of paths) {
      if (p === "") continue;
      const parts = p.split("/");
      const key = `${slug}\0${parts.join("/")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (shouldEmit(`tree/${slug}/${parts.join("/")}`)) {
        yield { refSlug: slug, path: parts };
      }
    }
  }

  // 2. Per-commit changed paths — pin "open file" links from
  //    DiffView to the commit's actual state at that point.
  //
  //    LIVE MODE ONLY. Rationale:
  //
  //    - Resolution: `/tree/<commit-sha>/<path>` calls
  //      `resolvePath(sha, path)` → `getTreeIndex(sha)`. The
  //      manifest only carries tree indices for *extracted refs*
  //      (branches/tags); arbitrary commit shas would ENOENT.
  //      Storing per-commit indices would require materializing
  //      the tree at every commit — bounded but wasteful for
  //      static export (the diff body already conveys the change).
  //
  //    - Symmetry: DiffView only renders the link in live mode.
  //      Manifest mode shows the path as plain text — no HEAD
  //      fallback, since that would silently misrepresent the
  //      file's state at this commit. Live emits + links + renders;
  //      manifest does none of the three.
  if (process.env.REACT_GIT_MODE === "live") {
    const shas = await listCommitShas();
    for (const sha of shas) {
      const diff = await getDiff(sha);
      for (const f of diff.files) {
        if (f.mode === "deleted") continue;
        const path = f.pathAfter ?? f.pathBefore;
        if (!path) continue;
        const parts = path.split("/");
        const key = `${sha}\0${parts.join("/")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (shouldEmit(`tree/${sha}/${parts.join("/")}`)) {
          yield { refSlug: sha, path: parts };
        }
      }
    }
  }
}
