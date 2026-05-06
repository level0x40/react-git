/**
 * @file Manifest reader — used by both the
 * `@level0x40/react-git/source/build` Node helpers (in `.static.{js,ts}`
 * files and tooling) and the Vite virtual module's `load` hook. Shards are
 * loaded lazily so a page rendering one commit doesn't pull every other
 * shard into memory.
 */

import * as fs from "node:fs/promises";

import { manifestPaths } from "./layout.js";

/**
 * @typedef {import("../git/types.js").SourceCommit} SourceCommit
 * @typedef {import("../git/types.js").SourceDiff} SourceDiff
 * @typedef {import("../git/types.js").SourceProject} SourceProject
 * @typedef {import("../git/types.js").SourceRef} SourceRef
 * @typedef {import("../git/types.js").SourceTree} SourceTree
 * @typedef {import("../git/types.js").SourceFile} SourceFile
 * @typedef {import("./write.js").TreeIndex} TreeIndex
 *
 * @typedef {object} ManifestReader
 * @property {string} root
 * @property {() => Promise<SourceProject>} readProject
 * @property {() => Promise<readonly SourceRef[]>} readRefs
 * @property {() => Promise<readonly string[]>} readCommitIndex
 * @property {() => Promise<readonly string[]>} readCommitCalendarDates
 * @property {(sha: string) => Promise<SourceCommit>} readCommit
 * @property {(ref: string) => Promise<TreeIndex>} readTreeIndex
 * @property {(ref: string, path: string) => Promise<SourceTree>} readTree
 * @property {(sha: string) => Promise<SourceFile>} readBlob
 * @property {(commitSha: string) => Promise<SourceDiff>} readDiff
 * @property {(ref: string) => Promise<readonly string[]>} readCommitIndexByRef
 */

/**
 * @param {string} repoRoot
 * @returns {ManifestReader}
 */
export function createManifestReader(repoRoot) {
  const paths = manifestPaths(repoRoot);
  return {
    root: paths.root,
    readProject: () => readJson(paths.project),
    readRefs: () => readJson(paths.refs),
    readCommitIndex: () => readJson(paths.commitsIndex),
    // Pre-emit on missing shard (older manifest from a build that ran
    // before the calendar shard was introduced) — fall back to empty so
    // `listCommitCalendar` shows an empty heatmap rather than crashing
    // the page.
    async readCommitCalendarDates() {
      try {
        return await readJson(paths.commitCalendarDates);
      } catch (e) {
        if (e?.code === "ENOENT") return [];
        throw e;
      }
    },
    readCommit: (sha) => readJson(paths.commitFile(sha)),
    readTreeIndex: (ref) => readJson(paths.treeIndexFile(ref)),
    readTree: (ref, p) => readJson(paths.treeFile(ref, p)),
    readBlob: (sha) => readJson(paths.blobFile(sha)),
    readDiff: (commitSha) => readJson(paths.diffFile(commitSha)),
    readCommitIndexByRef: (ref) => readJson(paths.commitIndexByRefFile(ref)),
  };
}

/**
 * @template T
 * @param {string} filePath
 * @returns {Promise<T>}
 */
async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}
