/**
 * @file Single source of truth for manifest paths. Sharded layout, JSON-on-disk:
 *
 *   <root>/
 *     project.json                         — SourceProject header, generation timestamp, schema version
 *     refs.json                            — SourceRef[] (branches + tags)
 *     commits/
 *       index.json                         — string[] of SHAs in newest-first order, full log
 *       <sha>.json                         — SourceCommit (lazy: written on demand)
 *     trees/
 *       <ref-slug>/
 *         _index.json                      — path → { kind, sha, size } resolver for this ref
 *         <path-slug>.json                 — SourceTree at (ref, path)  (kind=tree only)
 *     blobs/
 *       <sha>.json                         — SourceFile (content-addressable across refs)
 *
 * Phase 1 wrote project.json, refs.json, commits/. Phase 2 adds trees/ +
 * blobs/. Static-export pages enumerate their paths from trees/<ref>/_index.json.
 */

import * as path from "node:path";

// Build-artifact root for the CLI. Hidden by convention so it sits next
// to peers like `.next/`, `.nuxt/`, `.svelte-kit/`, `.turbo/`, `.cache/`
// rather than polluting the user's working tree. Holds the manifest
// (`cache/`), Vite cache (`vite/`), and built site output (`build/`).
//
// Safe to dot-prefix in the no-stage architecture: the file-router scan
// root is the package's `app/src/pages` (with cwd set to the package's
// `app/` before invoking react-server), not anywhere inside this
// workdir. Micromatch's default `dot: false` only drops paths *relative
// to its scan root* whose segments start with a dot — and from the
// file-router's perspective this directory is outside that scan, often
// outside the cwd entirely. `--template <dir>` is now a Vite-plugin
// indirection (see `runtime/template-plugin.js`); it doesn't stage
// anywhere on disk, so this dot-prefix decision stands across both
// modes.
export const MANIFEST_DIRNAME = ".react-git/cache";

export const PROJECT_FILE = "project.json";
export const REFS_FILE = "refs.json";
export const COMMITS_DIR = "commits";
export const COMMITS_INDEX_FILE = "index.json";
// All commit author-dates within the contribution-calendar window
// (~53 weeks). Uncapped — independent of `--max-commits`, which only
// bounds the per-ref `/log` shards. Stored as a flat `string[]` of ISO
// 8601 dates so the calendar's bucketing pass is a single linear scan.
export const COMMIT_CALENDAR_DATES_FILE = "calendar-dates.json";
export const TREES_DIR = "trees";
export const BLOBS_DIR = "blobs";
export const DIFFS_DIR = "diffs";
export const COMMITS_BY_REF_DIR = "commits/by-ref";

/**
 * @typedef {object} ManifestPaths
 * @property {string} root
 * @property {string} project
 * @property {string} refs
 * @property {string} commitsDir
 * @property {string} commitsIndex
 * @property {string} commitCalendarDates
 * @property {(sha: string) => string} commitFile
 * @property {(ref: string) => string} treeIndexFile
 * @property {(ref: string, path: string) => string} treeFile
 * @property {(sha: string) => string} blobFile
 * @property {(commitSha: string) => string} diffFile
 * @property {(ref: string) => string} commitIndexByRefFile
 */

/**
 * @param {string} repoRoot
 * @returns {ManifestPaths}
 */
export function manifestPaths(repoRoot) {
  const root = path.join(repoRoot, MANIFEST_DIRNAME);
  const commitsDir = path.join(root, COMMITS_DIR);
  return {
    root,
    project: path.join(root, PROJECT_FILE),
    refs: path.join(root, REFS_FILE),
    commitsDir,
    commitsIndex: path.join(commitsDir, COMMITS_INDEX_FILE),
    commitCalendarDates: path.join(commitsDir, COMMIT_CALENDAR_DATES_FILE),
    commitFile(sha) {
      return path.join(commitsDir, `${sha}.json`);
    },
    treeIndexFile(ref) {
      return path.join(root, TREES_DIR, slugifyRef(ref), "_index.json");
    },
    treeFile(ref, p) {
      return path.join(root, TREES_DIR, slugifyRef(ref), `${slugifyPath(p)}.json`);
    },
    blobFile(sha) {
      return path.join(root, BLOBS_DIR, `${sha}.json`);
    },
    diffFile(commitSha) {
      return path.join(root, DIFFS_DIR, `${commitSha}.json`);
    },
    commitIndexByRefFile(ref) {
      return path.join(root, COMMITS_BY_REF_DIR, `${slugifyRef(ref)}.json`);
    },
  };
}

/**
 * Refs can contain `/` (e.g. `feature/foo`) — encode as a flat slug so we
 * don't have to mkdir every level. Encoding is reversible: `_` is the
 * escape character.
 *
 * @param {string} ref
 * @returns {string}
 */
export function slugifyRef(ref) {
  return ref.replace(/_/g, "__").replace(/\//g, "_");
}

/**
 * Empty path (root tree) is represented as `_root` so we never hit empty
 * filename collisions. Other paths get the same flat-slug treatment as refs.
 *
 * @param {string} p
 * @returns {string}
 */
export function slugifyPath(p) {
  if (p === "" || p === "/") return "_root";
  return p.replace(/_/g, "__").replace(/\//g, "_");
}
