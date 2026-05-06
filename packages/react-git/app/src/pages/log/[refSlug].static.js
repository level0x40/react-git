import { listRefs, refToSlug, shouldEmit } from "@level0x40/react-git/source/build";

/**
 * Enumerate prerender params for `/log/<ref>` — every ref that the
 * orchestrator extracted gets a log page.
 *
 * Streaming form: yields one descriptor at a time so the exporter can
 * start rendering as soon as the first ref is enumerated.
 *
 * Incremental: skip ref logs already on disk. Branch refs move between
 * builds, so the cached log can be stale — `--force` after a pull.
 * Tags are immutable and always safe to skip.
 */
export default async function* staticPaths() {
  const refs = await listRefs();
  for (const r of refs) {
    const refSlug = refToSlug(r.shortName);
    if (shouldEmit(`log/${refSlug}`)) yield { refSlug };
  }
}
