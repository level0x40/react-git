/**
 * @file Manifest writer — atomic per-shard writes so a partial extraction
 * can't leave half-written JSON on disk for the runtime to choke on.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { manifestPaths } from "./layout.js";

/**
 * @typedef {import("../git/types.js").SourceCommit} SourceCommit
 * @typedef {import("../git/types.js").SourceDiff} SourceDiff
 * @typedef {import("../git/types.js").SourceProject} SourceProject
 * @typedef {import("../git/types.js").SourceRef} SourceRef
 * @typedef {import("../git/types.js").SourceTree} SourceTree
 * @typedef {import("../git/types.js").SourceFile} SourceFile
 *
 * Path entries inside `trees/<ref>/_index.json` — minimal lookup info so a
 * page can resolve a URL path to either a tree shard or a blob shard
 * without loading either upfront.
 *
 * @typedef {object} TreeIndexEntry
 * @property {"tree" | "blob"} kind
 * @property {string} sha
 * @property {number} size               -1 for trees, byte count for blobs
 *
 * @typedef {Record<string, TreeIndexEntry>} TreeIndex
 *
 * @typedef {object} ManifestWriter
 * @property {string} root
 * @property {(project: SourceProject) => Promise<void>} writeProject
 * @property {(refs: readonly SourceRef[]) => Promise<void>} writeRefs
 * @property {(shas: readonly string[]) => Promise<void>} writeCommitIndex
 * @property {(dates: readonly string[]) => Promise<void>} writeCommitCalendarDates
 * @property {(commit: SourceCommit) => Promise<void>} writeCommit
 * @property {(commits: readonly SourceCommit[]) => Promise<void>} writeCommits
 * @property {(ref: string, index: TreeIndex) => Promise<void>} writeTreeIndex
 * @property {(tree: SourceTree) => Promise<void>} writeTree
 * @property {(file: SourceFile) => Promise<void>} writeBlob
 * @property {(diff: SourceDiff) => Promise<void>} writeDiff
 * @property {(ref: string, shas: readonly string[]) => Promise<void>} writeCommitIndexByRef
 */

/**
 * @param {string} repoRoot
 * @returns {Promise<ManifestWriter>}
 */
export async function createManifestWriter(repoRoot) {
  const paths = manifestPaths(repoRoot);
  await fs.mkdir(paths.root, { recursive: true });
  await fs.mkdir(paths.commitsDir, { recursive: true });

  return {
    root: paths.root,

    async writeProject(project) {
      await writeJsonAtomic(paths.project, project);
    },

    async writeRefs(refs) {
      await writeJsonAtomic(paths.refs, refs);
    },

    async writeCommitIndex(shas) {
      await writeJsonAtomic(paths.commitsIndex, shas);
    },

    async writeCommitCalendarDates(dates) {
      await writeJsonAtomic(paths.commitCalendarDates, dates);
    },

    async writeCommit(commit) {
      await writeJsonAtomic(paths.commitFile(commit.sha), commit);
    },

    async writeCommits(commits) {
      // Fan out concurrently; per-file write is small.
      await Promise.all(commits.map((c) => writeJsonAtomic(paths.commitFile(c.sha), c)));
    },

    async writeTreeIndex(ref, index) {
      await writeJsonAtomic(paths.treeIndexFile(ref), index);
    },

    async writeTree(tree) {
      await writeJsonAtomic(paths.treeFile(tree.ref, tree.path), tree);
    },

    async writeBlob(file) {
      // Blobs are content-addressable by SHA — same content across refs
      // hits the same shard, so a tight loop in the orchestrator is safe
      // even when many refs share files.
      await writeJsonAtomic(paths.blobFile(file.sha), file);
    },

    async writeDiff(diff) {
      await writeJsonAtomic(paths.diffFile(diff.commitSha), diff);
    },

    async writeCommitIndexByRef(ref, shas) {
      await writeJsonAtomic(paths.commitIndexByRefFile(ref), shas);
    },
  };
}

/**
 * Write to <file>.tmp then rename — atomic on POSIX, near-atomic on Windows.
 *
 * @param {string} filePath
 * @param {unknown} value
 */
async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}
