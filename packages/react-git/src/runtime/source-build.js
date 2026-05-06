/**
 * @file Public Node entry point — `@level0x40/react-git/source/build`.
 *
 * Used in three places:
 *   1. `.static.{js,ts}` files inside the staged app, to enumerate
 *      prerender paths from manifest data without going through Vite's
 *      module graph.
 *   2. Server components and layouts, which read the same data during
 *      SSG / SSR / dev rendering.
 *   3. User tooling that wants to read the source-graph from a Node
 *      script (e.g. an external sitemap generator).
 *
 * The matching `@level0x40/react-git/source` virtual module re-exports
 * the same surface to route components, but participates in Vite's HMR
 * graph so dev-mode invalidation works.
 *
 * ── Two backing modes ──────────────────────────────────────────────
 *
 * Both modes implement the same public surface; consumers don't know
 * which is active. The factory `impl()` picks one based on
 * `REACT_GIT_MODE`:
 *
 *   - "manifest" (default): read pre-extracted JSON shards under
 *     `<workdir>/.react-git/cache/`. Fast, deterministic, requires
 *     a build-time extraction pass.
 *
 *   - "live": read directly from git via `GitAdapter`. No extraction
 *     pass needed; the staged app is committable and CI just runs
 *     SSG. Slower per-page but eliminates the manifest cache as a
 *     deployment artifact.
 *
 * ── Caching ────────────────────────────────────────────────────────
 *
 * Every public function carries a `"use cache; profile=react-git-data"`
 * directive. react-server's use-cache transform dedupes calls within
 * a build run by argument key, so the same blob/tree/commit/diff is
 * computed at most once per build regardless of how many pages
 * reference it. Manifest mode benefits from this too — multiple pages
 * reading the same shard share the cached result instead of hitting
 * disk repeatedly.
 *
 * The cache profile is declared in the synthesized
 * `react-server.config.mjs` (see `config-factory.js`).
 */

import { createManifestReader } from "../manifest/read.js";
import * as live from "./live-impl.js";
import { renderCommitMarkdown } from "./markdown.js";

/**
 * @typedef {import("../git/types.js").SourceCommit} SourceCommit
 * @typedef {import("../git/types.js").SourceDiff} SourceDiff
 * @typedef {import("../git/types.js").SourceFile} SourceFile
 * @typedef {import("../git/types.js").SourceProject} SourceProject
 * @typedef {import("../git/types.js").SourceRef} SourceRef
 * @typedef {import("../git/types.js").SourceTree} SourceTree
 * @typedef {import("../manifest/read.js").ManifestReader} ManifestReader
 * @typedef {import("../manifest/write.js").TreeIndex} TreeIndex
 * @typedef {import("../manifest/write.js").TreeIndexEntry} TreeIndexEntry
 */

const ENV_SOURCE_ROOT = "REACT_GIT_SOURCE_ROOT";
const ENV_REPO_ROOT = "REACT_GIT_REPO";
const ENV_MODE = "REACT_GIT_MODE";

/** @type {string | null} */
let cachedSourceRoot = null;
/** @type {string | null} */
let cachedRepoRoot = null;
/** @type {ManifestReader | null} */
let cachedReader = null;

/** @param {string} absolutePath */
export function setSourceRoot(absolutePath) {
  cachedSourceRoot = absolutePath;
  cachedReader = null;
}

/** @param {string} absolutePath */
export function setRepoRoot(absolutePath) {
  cachedRepoRoot = absolutePath;
}

/**
 * @returns {"manifest" | "live"}
 */
function mode() {
  return process.env[ENV_MODE] === "live" ? "live" : "manifest";
}

/** @returns {ManifestReader} */
function reader() {
  if (cachedReader) return cachedReader;
  const root = cachedSourceRoot ?? process.env[ENV_SOURCE_ROOT];
  if (!root) {
    throw new Error(
      `[@level0x40/react-git] manifest root not set. ` +
        `Either set ${ENV_SOURCE_ROOT} or call setSourceRoot() before importing source data.`,
    );
  }
  cachedReader = createManifestReader(root);
  return cachedReader;
}

/** @returns {string} */
function repoRoot() {
  const root = cachedRepoRoot ?? process.env[ENV_REPO_ROOT];
  if (!root) {
    throw new Error(
      `[@level0x40/react-git] repo root not set in live mode. ` +
        `Either set ${ENV_REPO_ROOT} or call setRepoRoot() before importing source data.`,
    );
  }
  return root;
}

// ── Public surface ────────────────────────────────────────────────────────

/** @returns {Promise<SourceProject>} */
export async function getProject() {
  "use cache; profile=react-git-data";
  return mode() === "live" ? live.readProject(repoRoot()) : reader().readProject();
}

/** @returns {Promise<readonly SourceRef[]>} */
export async function listRefs() {
  "use cache; profile=react-git-data";
  return mode() === "live" ? live.readRefs(repoRoot()) : reader().readRefs();
}

/** @returns {Promise<readonly string[]>} */
export async function listCommitShas() {
  "use cache; profile=react-git-data";
  if (mode() === "live") {
    const commits = await live.readCommitsByRef(repoRoot(), { limit: 50 });
    return commits.map((c) => c.sha);
  }
  return reader().readCommitIndex();
}

/**
 * @param {string} sha
 * @returns {Promise<SourceCommit & { bodyHtml: string }>}
 */
export async function getCommit(sha) {
  "use cache; profile=react-git-data";
  const commit = await (mode() === "live"
    ? live.readCommit(repoRoot(), sha)
    : reader().readCommit(sha));
  // Render the commit body as markdown server-side. The renderer
  // escapes inline HTML (`html: false`) so injecting via
  // dangerouslySetInnerHTML is safe even on hostile commit messages.
  // Empty body renders to "" — callers can use that as the
  // "no body" check without re-reading the raw `body` field.
  const bodyHtml = await renderCommitMarkdown(commit.body);
  return { ...commit, bodyHtml };
}

/** @returns {Promise<readonly SourceCommit[]>} */
export async function listCommits() {
  "use cache; profile=react-git-data";
  if (mode() === "live") {
    return live.readCommitsByRef(repoRoot(), { limit: 50 });
  }
  const r = reader();
  const shas = await r.readCommitIndex();
  return Promise.all(shas.map((s) => r.readCommit(s)));
}

/**
 * Per-day commit counts for a contribution-calendar heatmap.
 *
 * Returns a fixed 53-week × 7-day grid aligned to the current week
 * (rightmost column ends at today; leftmost column begins on the
 * Sunday 52 weeks earlier). Cells in the future relative to the
 * snapshot moment are flagged so the renderer can hide them.
 *
 * Aggregates from `--all --no-merges` on the live side; from the
 * full commit shard list on the manifest side. Both modes count
 * by author-date in UTC — using local time would shuffle commits
 * across day boundaries depending on which machine renders the
 * site, breaking determinism for static export.
 *
 * The result is small and self-contained (≈400 numbers + a
 * timestamp), so we cache the whole grid rather than the raw
 * input list — much smaller cache key/value than caching the
 * date list and re-bucketing per render.
 *
 * @returns {Promise<CommitCalendar>}
 *
 * @typedef {object} CommitCalendarCell
 * @property {string} date          ISO date `YYYY-MM-DD`
 * @property {number} count         commits authored on that day
 * @property {number} weekday       0=Sunday … 6=Saturday
 * @property {boolean} isFuture     true for cells past the snapshot;
 *                                  renderer should hide them
 *
 * @typedef {object} CommitCalendar
 * @property {readonly (readonly CommitCalendarCell[])[]} weeks
 *   53 weeks, each a 7-cell array indexed by weekday (0=Sun..6=Sat).
 * @property {number} totalCommits  sum of all `count` values in the grid
 * @property {number} maxCount      max `count` across all cells (drives bucketing)
 * @property {string} startDate     ISO date of the leftmost-column Sunday
 * @property {string} endDate       ISO date of today (UTC)
 */
export async function listCommitCalendar() {
  "use cache; profile=react-git-data";
  // 53 weeks × 7 days = 371 days. Small enough that the input list
  // (one date string per commit, even on busy repos) is bounded;
  // bucketing is a single pass.
  const today = startOfUtcDay(new Date());
  const weekday = today.getUTCDay();
  // Walk back to the Sunday 52 weeks before today's Sunday — that
  // gives us 53 columns with the rightmost column containing today.
  const startSunday = new Date(today);
  startSunday.setUTCDate(startSunday.getUTCDate() - weekday - 52 * 7);
  // Query window starts at startSunday, ends now. Both modes scan
  // the same window; a date stamp before startSunday is silently
  // dropped by the aggregator below.
  const dates = await collectCommitDates(startSunday);

  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const iso of dates) {
    // Slice to YYYY-MM-DD in UTC. `toISOString().slice(0, 10)` would
    // re-stringify; the input is already ISO-8601 from %aI.
    const day = iso.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const weeks = [];
  let totalCommits = 0;
  let maxCount = 0;
  for (let w = 0; w < 53; w++) {
    /** @type {CommitCalendarCell[]} */
    const week = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(startSunday);
      cell.setUTCDate(cell.getUTCDate() + w * 7 + d);
      const date = cell.toISOString().slice(0, 10);
      const count = counts.get(date) ?? 0;
      const isFuture = cell.getTime() > today.getTime();
      week.push({ date, count, weekday: d, isFuture });
      if (!isFuture) {
        totalCommits += count;
        if (count > maxCount) maxCount = count;
      }
    }
    weeks.push(week);
  }

  return {
    weeks,
    totalCommits,
    maxCount,
    startDate: startSunday.toISOString().slice(0, 10),
    endDate: today.toISOString().slice(0, 10),
  };
}

/**
 * Pull commit author-dates since the given moment from whichever
 * backing mode is active. Returns ISO-8601 strings — the bucketer
 * only inspects the YYYY-MM-DD prefix.
 *
 * Manifest mode: `readCommitIndex` lists every SHA on the project,
 * and `readCommit` resolves the full record per shard. We need only
 * the author date; the rest of the record gets discarded. This is
 * the same shard-read shape `listCommits()` uses today, so the
 * worst case is bounded by repo size and amortized once per process
 * via `"use cache"`. If this becomes a bottleneck at scale we can
 * shard a slim `commits/dates.json` during extraction; not worth
 * the extra extraction step for typical repos.
 *
 * @param {Date} since
 * @returns {Promise<readonly string[]>}
 */
async function collectCommitDates(since) {
  if (mode() === "live") {
    return live.readCommitDates(repoRoot(), { since });
  }
  // Manifest mode: read the dedicated calendar shard, populated at
  // extraction time by `adapter.listCommitDates({ since })` over
  // `--all --no-merges`. Independent of `--max-commits` (which only
  // bounds the per-ref `/log` shards) — without this shard, the
  // calendar would show at most `maxCommits` dots over the whole
  // window, which on busy repos collapses to "the last few weeks of
  // the last month".
  const r = reader();
  const dates = await r.readCommitCalendarDates();
  const sinceMs = since.getTime();
  // Drop dates before the window start. The shard is built from the
  // same `since` the runtime uses, so this filter is normally a no-op;
  // it exists for two cases. (1) An older shard whose extraction window
  // doesn't cover today's window (e.g. cached from yesterday's build —
  // today's `since` is 24h later). (2) An empty shard from a manifest
  // built before the shard was introduced (`readCommitCalendarDates`
  // ENOENT-falls back to `[]`).
  return dates.filter((iso) => Date.parse(iso) >= sinceMs);
}

/**
 * @param {Date} d
 * @returns {Date} a copy of `d` floored to UTC midnight
 */
function startOfUtcDay(d) {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/**
 * The ref slug used as the URL-default "current ref". Build orchestrator
 * and pages must agree on this — same logic in both: prefer the
 * symbolic-ref short name (e.g. "main"), fall back to "HEAD" for
 * detached repos.
 *
 * @returns {Promise<string>}
 */
export async function getHeadRef() {
  "use cache; profile=react-git-data";
  const project = await getProject();
  return project.defaultBranch ?? "HEAD";
}

// ── tree + blob lookups ───────────────────────────────────────────────────

/**
 * Return the tree-index for a ref — a flat map from path to
 * `{ kind, sha, size }`.
 *
 * @param {string} ref
 * @returns {Promise<TreeIndex>}
 */
export async function getTreeIndex(ref) {
  "use cache; profile=react-git-data";
  return mode() === "live" ? live.readTreeIndex(repoRoot(), ref) : reader().readTreeIndex(ref);
}

/**
 * @param {string} ref
 * @param {string} path  empty string for the repo root
 * @returns {Promise<SourceTree>}
 */
export async function getTree(ref, path) {
  "use cache; profile=react-git-data";
  return mode() === "live" ? live.readTree(repoRoot(), ref, path) : reader().readTree(ref, path);
}

/**
 * @param {string} sha
 * @param {{ ref?: string, path?: string }} [opts]
 *   Hints used by live mode to attach the right context to the
 *   returned `SourceFile` (`ref`, `path`) and to detect language for
 *   Shiki highlighting from the file extension. Manifest mode
 *   ignores them — those fields were captured at extraction time.
 *   Pages that already know `ref`/`path` (which is most of them, since
 *   they got here via `resolvePath`) should pass both. Cache keys
 *   include these hints, so different `(sha, ref, path)` tuples cache
 *   separately even though the rendered HTML for the same `sha` is
 *   typically identical — a small dedup loss in exchange for correct
 *   syntax highlighting in live mode.
 * @returns {Promise<SourceFile>}
 */
export async function getBlob(sha, opts) {
  "use cache; profile=react-git-data";
  const blob = await (mode() === "live"
    ? live.readBlob(repoRoot(), sha, opts)
    : reader().readBlob(sha));

  // ── Renderable-format augmentation ──────────────────────────────
  //
  // BlobView dispatches on the augmented fields:
  //
  //   - `bodyHtml`: rendered markdown HTML. Set when the file's
  //     extracted text content is a markdown source — works in BOTH
  //     modes since the source content is already a string.
  //
  //   - `mediaUri`: a `data:` URI carrying the file's content for
  //     direct browser rendering (`<img>`, `<video>`, `<audio>`).
  //     Two paths:
  //       a) SVG — text content, base64'd inline. Both modes.
  //       b) Image/audio/video binaries — bytes read fresh from
  //          git. Live mode only (manifest mode doesn't store
  //          binary bytes; binaries continue to surface as "binary
  //          file" placeholders, same as before).
  //
  // Skipped silently when the content/byte-size budget is exceeded
  // — BlobView falls back to its existing oversized/binary states.

  // (a) Markdown — render server-side via markdown-it.
  //     Path-based detection: the runtime's `detectLanguage()` returns
  //     the literal extension (e.g. "md", "mdx") rather than the Shiki
  //     language id ("markdown"), so matching on `language` would miss.
  //     The path test is also more robust to future changes in the
  //     language-tag normalization.
  if (blob.content && isMarkdownPath(blob.path)) {
    return { ...blob, bodyHtml: await renderCommitMarkdown(blob.content) };
  }

  // (b) SVG — text content already extracted, wrap in a data URI.
  if (blob.content && isSvgPath(blob.path)) {
    // utf-8 + URI-encoded payload; cheaper than base64 and renders
    // identically in `<img src=...>`. Browsers sandbox SVGs loaded
    // via <img>, so embedded scripts can't execute.
    const uri = `data:image/svg+xml;utf8,${encodeURIComponent(blob.content)}`;
    return { ...blob, mediaUri: uri };
  }

  // (c) Binary media — image/audio/video. Live mode reads bytes
  //     fresh from git and inlines as base64. Manifest mode skips:
  //     the manifest format doesn't store bytes, so the BlobView
  //     binary placeholder remains.
  const mime = mimeForMedia(blob.path);
  if (
    mime &&
    blob.binary &&
    blob.size > 0 &&
    blob.size <= MAX_INLINE_MEDIA_BYTES &&
    mode() === "live"
  ) {
    const bytes = await live.readBlobBytes(repoRoot(), sha);
    if (bytes) {
      const uri = `data:${mime};base64,${bytes.toString("base64")}`;
      return { ...blob, mediaUri: uri };
    }
  }

  return blob;
}

/** Hard cap for inline media. Above this, the page falls back to the
 *  binary placeholder — embedding a 50 MiB video as base64 would
 *  produce a ~67 MiB HTML page, which makes static export miserable
 *  and crashes most parsers. */
const MAX_INLINE_MEDIA_BYTES = 8 * 1024 * 1024;

/** @param {string} p */
function isMarkdownPath(p) {
  return /\.(md|mdx|markdown)$/i.test(p);
}

/** @param {string} p */
function isSvgPath(p) {
  return /\.svg$/i.test(p);
}

/**
 * MIME for a file path's extension, restricted to media kinds that
 * the BlobView knows how to render. Returns null for everything
 * else — including SVG, which goes through the text path above
 * since its content is already extracted as text.
 *
 * @param {string} p
 * @returns {string | null}
 */
function mimeForMedia(p) {
  const dot = p.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = p.slice(dot + 1).toLowerCase();
  return MEDIA_MIME[ext] ?? null;
}

const MEDIA_MIME = /** @type {Record<string, string>} */ ({
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  opus: "audio/opus",
  // Video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/mp4",
});

/**
 * Resolve a URL path within a ref to its stored entry — `kind: "tree"`
 * or `kind: "blob"`. Returns null if the path doesn't exist at this ref.
 *
 * @param {string} ref
 * @param {string} path
 * @returns {Promise<TreeIndexEntry | null>}
 */
export async function resolvePath(ref, path) {
  "use cache; profile=react-git-data";
  const index = await getTreeIndex(ref);
  return index[path] ?? null;
}

/**
 * All known paths at this ref. Used by `.static.{js}` files to
 * enumerate prerender params.
 *
 * @param {string} ref
 * @returns {Promise<readonly string[]>}
 */
export async function listAllPaths(ref) {
  "use cache; profile=react-git-data";
  const index = await getTreeIndex(ref);
  return Object.keys(index);
}

// ── emission-scope predicates ─────────────────────────────────────────────
//
// Static export only emits pages for items the static enumerators agree
// to enumerate. Deep tree paths are gated by `REACT_GIT_BROWSE_REFS`
// (default = HEAD only); per-commit pages are gated by the global
// `--max-commits` cap (= the contents of `commits/index.json`).
//
// Link sites in the rendered UI must consult the SAME filter so the
// static deploy is self-consistent — every <a href> in emitted HTML
// resolves to a real file on disk. Linking to an unemitted target
// produces a 404 under any plain static host (Python's http.server,
// nginx, S3, etc.). When the target is filtered out, fall back to
// rendering the SHA / path as plain text rather than an anchor.

const ENV_BROWSE_REFS = "REACT_GIT_BROWSE_REFS";

/**
 * Refs whose deep `/tree/<ref>/<path>` URLs are emitted by the static
 * enumerator. Default: HEAD only. `*` means every extracted ref.
 * Comma-separated short-names otherwise. Same logic the matching
 * `.static.js` enumerator uses — single source of truth.
 *
 * Root tree pages (`/tree/<ref>/`) are emitted for *every* ref,
 * regardless of this set. Only deep paths are gated.
 *
 * @returns {Promise<Set<string>>}
 */
export async function resolveBrowseSet() {
  "use cache; profile=react-git-data";
  const raw = process.env[ENV_BROWSE_REFS];
  if (!raw) return new Set([await getHeadRef()]);
  if (raw.trim() === "*") {
    const refs = await listRefs();
    return new Set(refs.map((r) => r.shortName));
  }
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * `true` iff deep `/tree/<ref>/<path>` URLs for this ref are emitted.
 * Use to gate FileBrowser entry links and tree-page crumb segments.
 *
 * @param {string} ref
 * @returns {Promise<boolean>}
 */
export async function isRefBrowsable(ref) {
  "use cache; profile=react-git-data";
  const browse = await resolveBrowseSet();
  return browse.has(ref);
}

/**
 * `true` iff `/commit/<sha>` will be emitted as a static page. Use to
 * gate commit-link sites (log views, parent SHAs on commit pages).
 *
 * Backed by the same set the `[sha].static.js` enumerator returns, so
 * a render-time check matches the build-time enumeration exactly.
 *
 * @param {string} sha
 * @returns {Promise<boolean>}
 */
export async function isCommitEmitted(sha) {
  "use cache; profile=react-git-data";
  const shas = await listCommitShas();
  return shas.includes(sha);
}

// ── per-ref commit index ──────────────────────────────────────────────────

/**
 * Per-ref commit history (newest-first), bounded by the build-time
 * `--max-commits` cap.
 *
 * @param {string} ref
 * @returns {Promise<readonly string[]>}
 */
export async function listCommitShasByRef(ref) {
  "use cache; profile=react-git-data";
  if (mode() === "live") {
    const commits = await live.readCommitsByRef(repoRoot(), { ref, limit: 50 });
    return commits.map((c) => c.sha);
  }
  return reader().readCommitIndexByRef(ref);
}

// Re-export the URL slug helpers so `.static.{js,ts}` files (which
// import from this `/source/build` subpath) and route components
// (which import from `/source`) share one canonical encoding.
export { refToSlug, slugToRef } from "./ref-slug.js";

// Re-export the incremental-export filter so each `.static.js` can
// short-circuit on already-emitted entries without reaching for fs
// itself. Build-time only; gated by env vars `build.js` sets.
//   - `pruneExisting` — array-in/array-out, for the legacy non-
//     streaming form of `.static.js` enumerators.
//   - `shouldEmit` — predicate companion, for `async function*`
//     enumerators that yield descriptors lazily.
export { pruneExisting, shouldEmit } from "./incremental.js";

// ── diff lookup ───────────────────────────────────────────────────────────

/**
 * Fetch a structured per-file diff for a commit.
 *
 * @param {string} commitSha
 * @returns {Promise<SourceDiff>}
 */
export async function getDiff(commitSha) {
  "use cache; profile=react-git-data";
  return mode() === "live" ? live.readDiff(repoRoot(), commitSha) : reader().readDiff(commitSha);
}
