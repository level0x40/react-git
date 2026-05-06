/**
 * @file Typed source-graph emitted by the Git adapter and consumed by the
 * `@level0x40/react-git/source` virtual module + `.../source/build` Node
 * helpers. JSDoc-only; no runtime exports.
 *
 * @typedef {object} SourceProject
 * @property {string} name
 *   Repository basename, derived from --repo path or `git config`.
 * @property {string | null} description
 *   Optional one-line description, sourced from a `description` file in bare repos.
 * @property {boolean} bare
 *   Whether the repo was opened as a bare repository.
 * @property {string | null} defaultBranch
 *   Default branch ref short-name, e.g. `main`. May be null in detached repos.
 * @property {string} headSha
 *   SHA the HEAD ref points at.
 * @property {string} generatedAt
 *   Wall-clock time the manifest was extracted (ISO 8601).
 * @property {1} schemaVersion
 *   Schema version; bumped on breaking changes.
 *
 * @typedef {object} SourceSignature
 * @property {string} name
 * @property {string} email
 * @property {string} date
 *   Author/committer time as ISO 8601, normalized to UTC.
 *
 * @typedef {object} SourceCommit
 * @property {string} sha
 * @property {string | null} parent
 *   First parent SHA, or null for the root commit.
 * @property {readonly string[]} parents
 *   All parents (>=2 means merge commit).
 * @property {SourceSignature} author
 * @property {SourceSignature} committer
 * @property {string} subject
 *   First line of the commit message.
 * @property {string} body
 *   Remaining commit message body, may be empty.
 *
 * @typedef {"blob" | "tree" | "commit"} SourceTreeEntryKind
 *
 * @typedef {object} SourceTreeEntry
 * @property {SourceTreeEntryKind} kind
 * @property {string} sha
 *   Object SHA (blob, sub-tree, or submodule commit).
 * @property {string} name
 *   Path segment relative to the parent tree.
 * @property {string} path
 *   Full path from the repo root.
 * @property {string} mode
 *   Octal mode string from `git ls-tree`, e.g. "100644".
 * @property {number} size
 *   Size in bytes. -1 for trees/submodules.
 *
 * @typedef {object} SourceTree
 * @property {string} ref
 * @property {string} path
 * @property {readonly SourceTreeEntry[]} entries
 *
 * @typedef {object} SourceFile
 * @property {string} ref
 * @property {string} path
 * @property {string} sha
 * @property {number} size
 * @property {boolean} binary
 * @property {string | null} language
 *   Detected language (lowercased extension or null).
 * @property {string | null} content
 *   UTF-8 text contents if not binary and within size cap.
 * @property {string | null} html
 *   Pre-rendered, dual-theme Shiki HTML when language was supported.
 *   Null when unsupported, binary, oversized, or highlighting failed.
 *
 * @typedef {object} SourceRef
 * @property {string} fullName
 *   Full ref, e.g. "refs/heads/main".
 * @property {string} shortName
 *   Short name, e.g. "main" or "v1.0.0".
 * @property {"branch" | "tag" | "other"} kind
 * @property {string} sha
 * @property {boolean} isHead
 *   True for the repository's HEAD-pointing branch.
 *
 * @typedef {"context" | "add" | "remove"} SourceDiffLineKind
 *
 * @typedef {object} SourceDiffLine
 * @property {SourceDiffLineKind} kind
 * @property {string} text
 *   Line content with the leading +/-/space stripped.
 * @property {string | null} html
 *   Pre-rendered Shiki token spans for this line (no wrapper),
 *   suitable for inline use inside a diff table cell.
 *   Null for unsupported languages.
 *
 * @typedef {object} SourceDiffHunk
 * @property {number} oldStart
 *   1-based starting line in the old (pre-image) file.
 * @property {number} oldLines
 *   Line count covered in the old file (1 if omitted in source).
 * @property {number} newStart
 *   1-based starting line in the new (post-image) file.
 * @property {number} newLines
 *   Line count covered in the new file.
 * @property {string} header
 *   Section context after the closing `@@` (function name, etc.). May be empty.
 * @property {SourceDiffLine[]} lines
 *
 * @typedef {"added" | "deleted" | "modified" | "renamed" | "copied"} SourceDiffFileMode
 *
 * @typedef {object} SourceDiffFile
 * @property {string | null} pathBefore  null for added files
 * @property {string | null} pathAfter   null for deleted files
 * @property {SourceDiffFileMode} mode
 * @property {boolean} binary
 *   True if git emitted "Binary files … differ" or a binary patch instead of a textual diff.
 * @property {SourceDiffHunk[]} hunks    empty for binary or pure-rename-no-content-change diffs
 * @property {number} additions
 * @property {number} deletions
 *
 * @typedef {object} SourceDiff
 * @property {string} commitSha
 * @property {string | null} parentSha
 *   First-parent SHA used as the diff base. null for the root commit (diff vs empty tree).
 * @property {SourceDiffFile[]} files
 */

export {};
