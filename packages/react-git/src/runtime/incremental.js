/**
 * @file Incremental static-export filtering for `.static.js` enumerators.
 *
 * Skips entries whose target HTML file already exists in the previous
 * build's preserved dist directory, turning a re-build into a no-op
 * for any page whose URL→file mapping was emitted by an earlier run.
 *
 * Activation contract:
 *
 *   - `REACT_GIT_BUILD_OUT` (set by `build.js`) points at the
 *     PREVIOUS build's dist root, which `build.js` renames aside as
 *     `.prev/dist` before invoking react-server (whose internal
 *     wipe would otherwise destroy it). After the build, `build.js`
 *     merges any non-overwritten files from `.prev` back into the
 *     active dir. From this helper's perspective, the env var just
 *     names "where to check for already-emitted output." Unset means
 *     "no previous build to compare against" — typically a clean
 *     workdir or the dev pipeline's warmup pass — and the helper
 *     short-circuits to identity.
 *
 *   - `REACT_GIT_FORCE_REBUILD=1` (set by `--force`) bypasses the
 *     skip entirely. Same semantic as `--force`'s effect on the
 *     extraction cache: "redo all the work".
 *
 * Correctness compromise: file existence alone is the signal. For
 * URLs whose content is content-addressable in the URL itself
 * (`/commit/<sha>`, `/tree/<tag>/<path>` for immutable refs), this is
 * always safe. For URLs whose content moves with mutable refs
 * (`/tree/<branch>/<path>`, `/files/<path>`, `/log/<branch>`,
 * aggregate views), a previous build's HTML may be stale after the
 * branch advances — the user runs `--force` after pulling. The
 * tradeoff: rebuild-after-no-data-change is near-instant; the
 * rebuild-after-pull case requires an explicit signal.
 *
 * The helper does not delete stale entries from disk. If a ref is
 * removed between builds, its emitted HTML lingers in the dist
 * directory until the next `--force` build, which wipes everything
 * up front. Same-shape compromise: explicit, predictable, escape-
 * hatch via the existing flag.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const ENV_BUILD_OUT = "REACT_GIT_BUILD_OUT";
const ENV_FORCE = "REACT_GIT_FORCE_REBUILD";

/**
 * Filter a list of static-export entries to those whose emitted file
 * does NOT yet exist on disk. No-op when the build-out env var is
 * unset (dev mode, warmup) or when force-rebuild is requested.
 *
 * Sync `existsSync` chosen over `fs.access` per call: each call is a
 * single `stat` syscall, modern OSes handle 50k+/sec on local FS, and
 * for typical repos (1-5k enumerated paths) the filter completes in
 * well under 100ms. Avoiding async sidesteps both file-descriptor
 * exhaustion (an unbounded `Promise.all` of `access` calls can hit
 * EMFILE on dense trees) and the per-call event-loop overhead, which
 * dominates for small, fast operations like this.
 *
 * @template T
 * @param {readonly T[]} entries
 * @param {(entry: T) => string} urlOf
 *   Returns the URL path RELATIVE to the dist root — no leading
 *   slash, no `/index.html` suffix. Empty string is treated as the
 *   root URL (`/`), which maps to `<dist>/index.html`.
 * @returns {readonly T[]}
 */
export function pruneExisting(entries, urlOf) {
  if (process.env[ENV_FORCE] === "1") return entries;
  const out = process.env[ENV_BUILD_OUT];
  if (!out) return entries;

  /** @type {T[]} */
  const kept = [];
  for (const entry of entries) {
    const rel = urlOf(entry);
    const file = rel === "" ? path.join(out, "index.html") : path.join(out, rel, "index.html");
    if (!fs.existsSync(file)) {
      kept.push(entry);
    }
  }
  return kept;
}

/**
 * Streaming-friendly predicate companion to {@link pruneExisting}.
 * Returns true if the given URL path's HTML file does NOT yet exist
 * on disk in the previous build's preserved dist (or if force-rebuild
 * is requested, or no previous build is available — which short-
 * circuits to "always emit").
 *
 * Used inside `async function*` static-path enumerators so they can
 * yield descriptors lazily one at a time, keeping peak memory at
 * O(one descriptor) regardless of total path count and letting the
 * exporter start rendering as soon as the first descriptor is yielded.
 * See https://react-server.dev/router/static#streaming-static-paths.
 *
 * @param {string} urlPath - URL path RELATIVE to the dist root, no
 *   leading slash, no `/index.html` suffix. Empty string maps to
 *   `<dist>/index.html` (the root URL).
 * @returns {boolean}
 */
export function shouldEmit(urlPath) {
  if (process.env[ENV_FORCE] === "1") return true;
  const out = process.env[ENV_BUILD_OUT];
  if (!out) return true;
  const file =
    urlPath === "" ? path.join(out, "index.html") : path.join(out, urlPath, "index.html");
  return !fs.existsSync(file);
}
