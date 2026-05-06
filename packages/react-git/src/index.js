/**
 * @file Public programmatic entry point — `@level0x40/react-git`. Lets
 * callers embed the build pipeline in their own tooling without going
 * through the CLI.
 */

export { buildSite } from "./build.js";

/**
 * @typedef {import("./git/types.js").SourceCommit} SourceCommit
 * @typedef {import("./git/types.js").SourceProject} SourceProject
 * @typedef {import("./git/types.js").SourceRef} SourceRef
 * @typedef {import("./git/types.js").SourceTreeEntry} SourceTreeEntry
 * @typedef {import("./git/types.js").SourceFile} SourceFile
 * @typedef {import("./build.js").BuildOptions} BuildOptions
 */
