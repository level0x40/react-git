import { listRefs, refToSlug, shouldEmit } from "@level0x40/react-git/source/build";

/**
 * Enumerate prerender params for `/tree/<ref>` — one entry per ref the
 * build orchestrator extracted (matching the include/exclude filters
 * applied at extraction time, since unsupported refs have no tree
 * shards on disk).
 *
 * Streaming form: yields one descriptor at a time so the exporter can
 * start rendering as soon as the first ref is enumerated.
 *
 * Incremental: skip refs whose root tree page is already emitted.
 * Branch refs CAN move between builds, in which case the cached HTML
 * is stale until `--force` — see `shouldEmit`/`pruneExisting` for the
 * documented compromise.
 */
export default async function* staticPaths() {
  const refs = await listRefs();
  for (const r of refs) {
    const refSlug = refToSlug(r.shortName);
    if (shouldEmit(`tree/${refSlug}`)) yield { refSlug };
  }
}
