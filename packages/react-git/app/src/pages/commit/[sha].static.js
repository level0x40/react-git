import { listCommitShas, shouldEmit } from "@level0x40/react-git/source/build";

/**
 * Enumerate static prerender params for `/commit/[sha]`. One entry per
 * commit we have a diff shard for — bounded by `--max-commits` at
 * extraction time.
 *
 * Streaming form: yields one descriptor at a time so the exporter can
 * start rendering as soon as the first commit is enumerated, and peak
 * memory stays at O(one descriptor) regardless of commit count.
 *
 * Incremental: skip shas whose `<dist>/commit/<sha>/index.html` is
 * already on disk. Always safe — `<sha>` is content-addressable, so
 * the rendered HTML for a given sha is invariant across builds. No
 * `--force` caveat here.
 */
export default async function* staticPaths() {
  const shas = await listCommitShas();
  for (const sha of shas) {
    if (shouldEmit(`commit/${sha}`)) yield { sha };
  }
}
