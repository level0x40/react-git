/**
 * @file Unified-diff → structured model parser. Turns the raw output of
 * `git diff-tree -p -M -C` into an array of {@link SourceDiffFile}
 * records that page components can render without any string scraping.
 *
 * Hand-written (no dep) for two reasons:
 *   1. The format is small and stable enough to maintain ourselves.
 *   2. Avoids pulling a transitive parser into the build runtime.
 *
 * Format reference:
 *   diff --git a/<path> b/<path>
 *   [similarity index N%]
 *   [rename from <path>]              \  -M emits these instead of
 *   [rename to <path>]                /   --- a / +++ b
 *   [copy from <path>]                \  -C emits these
 *   [copy to <path>]                  /
 *   [new file mode <mode>]            ← added
 *   [deleted file mode <mode>]        ← deleted
 *   [index <oldsha>..<newsha> <mode>]
 *   [Binary files a/<path> and b/<path> differ]
 *   --- a/<path> | --- /dev/null
 *   +++ b/<path> | +++ /dev/null
 *   @@ -L,N +L,N @@ <header>
 *    context
 *   -removed
 *   +added
 *   \ No newline at end of file
 *
 * Each diff section is terminated by either the next `diff --git` line
 * or end-of-input. Empty lines never appear inside a hunk — context
 * lines that are blank in source are rendered as a single space.
 */

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/**
 * @typedef {import("./types.js").SourceDiffFile} SourceDiffFile
 * @typedef {import("./types.js").SourceDiffHunk} SourceDiffHunk
 * @typedef {import("./types.js").SourceDiffLine} SourceDiffLine
 * @typedef {import("./types.js").SourceDiffFileMode} SourceDiffFileMode
 */

/**
 * @param {string} raw  output of `git diff-tree -p`
 * @returns {SourceDiffFile[]}
 */
export function parseUnifiedDiff(raw) {
  const lines = raw.split("\n");
  /** @type {SourceDiffFile[]} */
  const files = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith("diff --git ")) {
      i++;
      continue;
    }
    const result = parseFileSection(lines, i);
    files.push(result.file);
    i = result.next;
  }
  return files;
}

/**
 * @param {string[]} lines
 * @param {number} start  index of the `diff --git ...` line
 * @returns {{ file: SourceDiffFile, next: number }}
 */
function parseFileSection(lines, start) {
  const header = lines[start];
  // The "a/<path> b/<path>" portion of the header — we only trust this
  // for the modified case; renames/copies overwrite via "rename from"
  // and friends below.
  const headerMatch = header.match(/^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/);
  let pathBefore = headerMatch ? headerMatch[1] : null;
  let pathAfter = headerMatch ? headerMatch[2] : null;

  /** @type {SourceDiffFileMode} */
  let mode = "modified";
  let binary = false;

  let i = start + 1;
  // Walk metadata lines until we either hit a hunk header, a binary
  // marker, the next file, or EOF.
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("diff --git ")) break;
    if (line.startsWith("@@ ")) break;

    if (line.startsWith("Binary files ") && line.endsWith(" differ")) {
      binary = true;
      i++;
      break;
    }
    if (line === "GIT binary patch") {
      // Skip the rest of the binary patch payload — we don't render it.
      binary = true;
      i++;
      while (i < lines.length && !lines[i].startsWith("diff --git ")) {
        i++;
      }
      break;
    }

    if (line.startsWith("new file mode ")) mode = "added";
    else if (line.startsWith("deleted file mode ")) mode = "deleted";
    else if (line.startsWith("rename from ")) {
      mode = "renamed";
      pathBefore = line.slice("rename from ".length);
    } else if (line.startsWith("rename to ")) {
      pathAfter = line.slice("rename to ".length);
    } else if (line.startsWith("copy from ")) {
      mode = "copied";
      pathBefore = line.slice("copy from ".length);
    } else if (line.startsWith("copy to ")) {
      pathAfter = line.slice("copy to ".length);
    }
    // --- a/path / +++ b/path / index … are informational; nothing to capture.
  }

  // Fix up paths for added/deleted now that we know the mode.
  if (mode === "added") pathBefore = null;
  if (mode === "deleted") pathAfter = null;

  /** @type {SourceDiffHunk[]} */
  const hunks = [];
  let additions = 0;
  let deletions = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("diff --git ")) break;
    if (!line.startsWith("@@ ")) {
      i++;
      continue;
    }
    const hunkResult = parseHunk(lines, i);
    additions += hunkResult.hunk.lines.reduce((n, l) => n + (l.kind === "add" ? 1 : 0), 0);
    deletions += hunkResult.hunk.lines.reduce((n, l) => n + (l.kind === "remove" ? 1 : 0), 0);
    hunks.push(hunkResult.hunk);
    i = hunkResult.next;
  }

  return {
    file: {
      pathBefore,
      pathAfter,
      mode,
      binary,
      hunks,
      additions,
      deletions,
    },
    next: i,
  };
}

/**
 * @param {string[]} lines
 * @param {number} start  index of the `@@` header line
 * @returns {{ hunk: SourceDiffHunk, next: number }}
 */
function parseHunk(lines, start) {
  const headerLine = lines[start];
  const m = headerLine.match(HUNK_HEADER_RE);
  // Tolerate (don't reject) malformed headers — emit an empty hunk and
  // resync at the next `@@` or `diff --git`.
  const oldStart = m ? Number(m[1]) : 0;
  const oldLines = m && m[2] !== undefined ? Number(m[2]) : 1;
  const newStart = m ? Number(m[3]) : 0;
  const newLines = m && m[4] !== undefined ? Number(m[4]) : 1;
  const header = m ? m[5].trim() : "";

  /** @type {SourceDiffLine[]} */
  const hunkLines = [];
  let i = start + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("diff --git ")) break;
    if (line.startsWith("@@ ")) break;
    if (line.startsWith("\\ ")) {
      // "\ No newline at end of file" — informational, not a content line.
      i++;
      continue;
    }
    if (line.length === 0) {
      // The hunk body never contains a truly empty line — empty
      // context is " " (single space). A length-0 line here is the
      // trailing newline artifact at EOF; bail.
      i++;
      break;
    }
    const ch = line[0];
    // `html` starts null and is filled in by the highlight pass in the
    // build orchestrator. Keeping the default here means SourceDiffLine
    // shape is stable from parser output through to manifest write.
    if (ch === "+") {
      hunkLines.push({ kind: "add", text: line.slice(1), html: null });
    } else if (ch === "-") {
      hunkLines.push({ kind: "remove", text: line.slice(1), html: null });
    } else if (ch === " ") {
      hunkLines.push({ kind: "context", text: line.slice(1), html: null });
    } else {
      // Foreign line (probably a stray metadata leak); stop the hunk
      // and let the outer loop find the next `@@` or `diff --git`.
      break;
    }
    i++;
  }

  return {
    hunk: { oldStart, oldLines, newStart, newLines, header, lines: hunkLines },
    next: i,
  };
}
