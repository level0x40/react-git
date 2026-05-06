/**
 * @file Live data layer — same shape as the manifest reader, but
 * each method calls into git directly via `GitAdapter`. Used when
 * `REACT_GIT_MODE=live`; selected by `source-build.js`.
 *
 * No caching here on purpose. The public functions in `source-build.js`
 * are wrapped with `"use cache; profile=react-git-data"` directives,
 * so caching/dedup is the framework's responsibility. This module
 * just produces fresh data on every call.
 *
 * Design notes:
 *
 *   - `GitAdapter` instance is process-singleton (one repo per build).
 *     The adapter manages a long-running `git cat-file --batch` for
 *     blob reads, which is cheap to keep open across many calls.
 *
 *   - Shiki highlighter is loaded lazily on first blob/diff read and
 *     stays alive for the rest of the build. Manifest mode disposes
 *     it before react-server build runs (since extraction is done at
 *     that point); live mode CAN'T dispose because the highlighter
 *     is needed during the build.
 *
 *   - Tree synthesis (parent dir entries from leaf paths) mirrors
 *     `build.js`'s extraction logic. Kept in this file rather than
 *     extracted to a shared module because the two contexts are
 *     subtly different — extraction needs every parent globally,
 *     live mode synthesizes per-request scope.
 */

import * as path from "node:path";

import { GitAdapter } from "../git/adapter.js";
import { parseUnifiedDiff } from "../git/diff-parser.js";
import { highlightBlob, highlightDiffLine } from "../highlight.js";

/** @typedef {import("../git/types.js").SourceCommit} SourceCommit */
/** @typedef {import("../git/types.js").SourceDiff} SourceDiff */
/** @typedef {import("../git/types.js").SourceFile} SourceFile */
/** @typedef {import("../git/types.js").SourceProject} SourceProject */
/** @typedef {import("../git/types.js").SourceRef} SourceRef */
/** @typedef {import("../git/types.js").SourceTree} SourceTree */
/** @typedef {import("../git/types.js").SourceTreeEntry} SourceTreeEntry */
/** @typedef {import("../manifest/write.js").TreeIndex} TreeIndex */

const BINARY_SNIFF_BYTES = 8192;
const DEFAULT_MAX_BLOB_BYTES = 512 * 1024;

/** @type {GitAdapter | null} */
let cachedAdapter = null;
/** @type {string | null} */
let cachedRepoRoot = null;
/** @type {ReturnType<GitAdapter["openBatchReader"]> | null} */
let cachedBatchReader = null;

/** @param {string} repoRoot */
function getAdapter(repoRoot) {
  if (cachedAdapter && cachedRepoRoot === repoRoot) return cachedAdapter;
  cachedAdapter = new GitAdapter({ repo: repoRoot });
  cachedRepoRoot = repoRoot;
  cachedBatchReader = null; // force re-open against the new repo
  return cachedAdapter;
}

/** @param {string} repoRoot */
function getBatchReader(repoRoot) {
  if (cachedBatchReader && cachedRepoRoot === repoRoot) return cachedBatchReader;
  cachedBatchReader = getAdapter(repoRoot).openBatchReader();
  return cachedBatchReader;
}

/**
 * Read a blob's raw bytes (binary-safe). Returns null for missing
 * objects. Used for media rendering — image/audio/video data URIs
 * in BlobView. The text path goes through `readBlob` instead, which
 * does utf-8 decoding + binary sniffing + Shiki highlight.
 *
 * @param {string} repoRoot
 * @param {string} sha
 * @returns {Promise<Buffer | null>}
 */
export async function readBlobBytes(repoRoot, sha) {
  return getAdapter(repoRoot).readBlobBytes(sha);
}

/**
 * @param {string} repoRoot
 * @returns {Promise<SourceProject>}
 */
export async function readProject(repoRoot) {
  const repoName = path.basename(repoRoot.replace(/\.git$/, ""));
  return getAdapter(repoRoot).resolveProject(repoName);
}

/**
 * @param {string} repoRoot
 * @returns {Promise<readonly SourceRef[]>}
 */
export async function readRefs(repoRoot) {
  return getAdapter(repoRoot).listRefs();
}

/**
 * @param {string} repoRoot
 * @param {string} sha
 * @returns {Promise<SourceCommit>}
 */
export async function readCommit(repoRoot, sha) {
  // listCommits with limit=1 + ref=sha returns the single commit's
  // record. Matches the shape of manifest's commits/<sha>.json shard.
  const out = await getAdapter(repoRoot).listCommits({ ref: sha, limit: 1 });
  if (out.length === 0) {
    throw new Error(`commit ${sha} not found`);
  }
  return out[0];
}

/**
 * @param {string} repoRoot
 * @param {{ ref?: string, limit?: number }} [opts]
 * @returns {Promise<readonly SourceCommit[]>}
 */
export async function readCommitsByRef(repoRoot, opts) {
  return getAdapter(repoRoot).listCommits(opts ?? {});
}

/**
 * @param {string} repoRoot
 * @param {{ since?: Date | string }} [opts]
 * @returns {Promise<readonly string[]>}
 */
export async function readCommitDates(repoRoot, opts) {
  return getAdapter(repoRoot).listCommitDates(opts ?? {});
}

/**
 * @param {string} repoRoot
 * @param {string} ref
 * @returns {Promise<TreeIndex>}
 */
export async function readTreeIndex(repoRoot, ref) {
  const allEntries = await getAdapter(repoRoot).listAllEntries(ref);
  /** @type {TreeIndex} */
  const index = {
    "": { kind: "tree", sha: "", size: -1 },
  };
  for (const entry of allEntries) {
    if (entry.kind === "commit") continue;
    index[entry.path] = {
      kind: entry.kind,
      sha: entry.sha,
      size: entry.size,
    };
  }
  return index;
}

/**
 * @param {string} repoRoot
 * @param {string} ref
 * @param {string} treePath
 * @returns {Promise<SourceTree>}
 */
export async function readTree(repoRoot, ref, treePath) {
  const allEntries = await getAdapter(repoRoot).listAllEntries(ref);
  // Children directly under treePath. Submodules (kind="commit") are
  // included because tree pages display them with a "submodule" tag,
  // even though they're not navigable.
  const prefix = treePath === "" ? "" : treePath + "/";
  const seen = new Set();
  /** @type {SourceTreeEntry[]} */
  const entries = [];
  for (const entry of allEntries) {
    if (!entry.path.startsWith(prefix)) continue;
    const rel = entry.path.slice(prefix.length);
    if (rel === "") continue;
    const slash = rel.indexOf("/");
    if (slash >= 0) {
      // Synthesize a tree entry for the immediate-child directory.
      const childName = rel.slice(0, slash);
      if (seen.has(childName)) continue;
      seen.add(childName);
      entries.push({
        kind: "tree",
        sha: "",
        name: childName,
        path: prefix + childName,
        mode: "040000",
        size: -1,
      });
    } else {
      if (seen.has(rel)) continue;
      seen.add(rel);
      entries.push({
        kind: entry.kind,
        sha: entry.sha,
        name: rel,
        path: entry.path,
        mode: entry.mode,
        size: entry.size,
      });
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { ref, path: treePath, entries };
}

/**
 * Read one blob, classify it, and (for text) Shiki-highlight it.
 * Mirrors `extractBlob` in build.js but produces the result in
 * memory rather than writing a shard.
 *
 * @param {string} repoRoot
 * @param {string} sha
 * @param {{ ref?: string, path?: string, maxBlobBytes?: number }} [opts]
 * @returns {Promise<SourceFile>}
 */
export async function readBlob(repoRoot, sha, opts = {}) {
  const ref = opts.ref ?? "";
  const filePath = opts.path ?? "";
  const maxBlobBytes = opts.maxBlobBytes ?? DEFAULT_MAX_BLOB_BYTES;

  /** @type {SourceFile} */
  const base = {
    ref,
    path: filePath,
    sha,
    size: -1,
    binary: false,
    language: detectLanguage(filePath),
    content: null,
    html: null,
  };

  const bytes = await getBatchReader(repoRoot).read(sha);
  if (!bytes) return base;

  base.size = bytes.length;

  if (bytes.length > maxBlobBytes) {
    return { ...base, content: null };
  }

  // Binary detection: NUL byte in the first 8 KiB is the conventional
  // tell. Mirrors what `git diff` and most editors do.
  const sniffEnd = Math.min(bytes.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < sniffEnd; i++) {
    if (bytes[i] === 0) {
      return { ...base, binary: true };
    }
  }

  const content = bytes.toString("utf8");
  const html = await highlightBlob(content, base.language);
  return { ...base, content, html };
}

/**
 * @param {string} repoRoot
 * @param {string} commitSha
 * @returns {Promise<SourceDiff>}
 */
export async function readDiff(repoRoot, commitSha) {
  const adapter = getAdapter(repoRoot);
  const raw = await adapter.readCommitDiff(commitSha);
  const files = parseUnifiedDiff(raw);

  // Per-line Shiki highlighting. Mirrors `extractDiffs` in build.js.
  for (const file of files) {
    if (file.binary) continue;
    const langPath = file.pathAfter ?? file.pathBefore;
    const lang = langPath ? detectLanguage(langPath) : null;
    if (!lang) continue;
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        line.html = await highlightDiffLine(line.text, lang);
      }
    }
  }

  // Find the commit's primary parent for the diff record header. We
  // already have it implicitly from `git diff-tree`; for the record
  // shape, look it up cheaply.
  const commits = await adapter.listCommits({ ref: commitSha, limit: 1 });
  const parentSha = commits[0]?.parent ?? null;

  return {
    commitSha,
    parentSha,
    files,
  };
}

/**
 * Cheap language tag from extension. Same allowlist as build.js — kept
 * separate so the two pipelines can drift independently if ever needed.
 *
 * @param {string} filePath
 * @returns {string | null}
 */
function detectLanguage(filePath) {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0 || dot === filePath.length - 1) return null;
  const ext = filePath.slice(dot + 1).toLowerCase();
  const known = new Set([
    "js",
    "jsx",
    "ts",
    "tsx",
    "mjs",
    "cjs",
    "mts",
    "cts",
    "json",
    "md",
    "mdx",
    "css",
    "scss",
    "sass",
    "less",
    "html",
    "xml",
    "svg",
    "yml",
    "yaml",
    "toml",
    "py",
    "rb",
    "go",
    "rs",
    "java",
    "kt",
    "swift",
    "c",
    "h",
    "cpp",
    "hpp",
    "sh",
    "bash",
    "zsh",
    "fish",
    "sql",
  ]);
  return known.has(ext) ? ext : null;
}
