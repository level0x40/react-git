/**
 * @file Public component entry point — `@level0x40/react-git/source`.
 *
 * For Phase 1 this is a transparent re-export of the build-time helpers.
 * Once the Vite plugin lands HMR support (Phase 6, dev mode), we'll
 * replace this with a thin wrapper that the plugin's `load` hook
 * intercepts to inject HMR boundary metadata. The public surface stays
 * identical, so user templates won't notice.
 */

export {
  getProject,
  listRefs,
  listCommitShas,
  getCommit,
  listCommits,
  listCommitCalendar,
  getTreeIndex,
  getTree,
  getBlob,
  resolvePath,
  listAllPaths,
  getHeadRef,
  getDiff,
  listCommitShasByRef,
  resolveBrowseSet,
  isRefBrowsable,
  isCommitEmitted,
} from "./source-build.js";

export { refToSlug, slugToRef } from "./ref-slug.js";
