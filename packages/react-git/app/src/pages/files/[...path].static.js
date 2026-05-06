import { getHeadRef, listAllPaths, shouldEmit } from "@level0x40/react-git/source/build";

/**
 * Enumerate prerender params for `/files/[...path]` — every non-root
 * path the manifest knows about (every directory and every blob).
 *
 * The empty path is the root tree, served by the sibling
 * `files/page.jsx` route — we drop it here to avoid a duplicate
 * declaration. Each remaining path becomes one HTML file at build time.
 *
 * Streaming form: yields one descriptor at a time so the exporter can
 * start rendering as soon as the first path is enumerated, and peak
 * memory stays at O(one descriptor) regardless of how many files the
 * repo contains.
 *
 * Incremental: skip paths already on disk. `/files/<path>` reads HEAD,
 * so if HEAD advances between builds the cached HTML can be stale —
 * `--force` after a pull. Same compromise as `/tree/<branch>/<path>`.
 */
export default async function* staticPaths() {
  const ref = await getHeadRef();
  const paths = await listAllPaths(ref);
  for (const p of paths) {
    if (p === "") continue;
    const parts = p.split("/");
    if (shouldEmit(`files/${parts.join("/")}`)) yield { path: parts };
  }
}
