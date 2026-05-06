import { Suspense } from "react";
// Cross-component import via the virtual indirection — user-overridden
// FileIcon wins. See template-plugin.js for resolution order.
import FileIcon from "virtual:rg/component/FileIcon";

/**
 * Per-file diff renderer. Renders ONE variant ("inline" or "split")
 * per call. The toggle (in CommitPage's DiffBodyShell) conditionally
 * mounts one variant subtree at a time based on the user's choice —
 * both subtrees are server-rendered and present in the RSC payload,
 * so toggling is a client-side conditional render with no server
 * round-trip.
 *
 * Hunks may be wrapped in `<Suspense>` (when > HUNK_LINES_PER_CHUNK
 * lines) so a single file with a very large diff still renders
 * incrementally rather than blowing past React's 512 KB streaming-
 * chunk warning during SSG export.
 *
 * `commitSha` pins the "open file" link in the header to the file's
 * state at THIS commit (`/tree/<sha>/<path>`) — but ONLY in LIVE
 * mode. In manifest mode (the static-export default) there is no
 * per-commit file viewer at all: the manifest stores tree indices
 * for extracted refs (branches/tags), not for arbitrary commit
 * shas. We deliberately do NOT link to `/files/<path>` (HEAD's
 * view) as a fallback — that link is actively misleading because
 * the file at HEAD may be wildly different (or absent) from the
 * file at this commit. The diff body itself is the source of
 * truth for what changed; in static export, that's the whole
 * story. In live mode, the runtime reads from git directly so
 * `/tree/<sha>/<path>` resolves for any commit, and the matching
 * static enumerator emits `(sha, changed-path)` pairs.
 *
 * @param {{
 *   file: import("@level0x40/react-git/source").SourceDiffFile,
 *   variant: "inline" | "split",
 *   commitSha: string,
 * }} props
 */
export default function DiffView({ file, variant, commitSha }) {
  const path = file.pathAfter ?? file.pathBefore ?? "unknown";
  const id = `diff-${path.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const showRename =
    (file.mode === "renamed" || file.mode === "copied") && file.pathBefore && file.pathAfter;
  // Linking is a LIVE-mode-only affordance:
  //   - live mode: /tree/<sha>/<path> resolves for any commit
  //     because the runtime reads git directly
  //   - manifest mode (static): no per-commit file viewer exists,
  //     and a HEAD-fallback link would lie about what the user is
  //     about to see. Plain text path is the honest UI.
  // Deleted files are never linked even in live mode — they have
  // no post-commit state to view.
  const liveMode = process.env.REACT_GIT_MODE === "live";
  const linkable = liveMode && file.mode !== "deleted";
  const targetPath = file.pathAfter ?? file.pathBefore;
  const fileHref = linkable ? `/tree/${commitSha}/${targetPath}` : null;
  const linkTitle = linkable ? `Open ${targetPath} at ${commitSha.slice(0, 8)}` : null;

  return (
    <article id={id} className="rg-diff">
      <header className="rg-diff-header">
        <span className={`rg-file-badge rg-file-badge-${file.mode}`}>
          {modeBadgeLabel(file.mode)}
        </span>
        {/* Icon is dispatched by the *new* path's basename — for
            renames/copies that's the destination filename, which
            is the file the user is actually navigating to. */}
        <FileIcon kind="blob" name={basenameOf(file.pathAfter ?? file.pathBefore ?? "")} />
        <code className="rg-diff-path">
          {showRename ? (
            <>
              <span className="rg-muted-inline">{file.pathBefore}</span>
              <span className="rg-arrow"> → </span>
              {fileHref ? (
                <a href={fileHref} className="rg-diff-path-link" title={linkTitle ?? undefined}>
                  {file.pathAfter}
                </a>
              ) : (
                file.pathAfter
              )}
            </>
          ) : fileHref ? (
            <a href={fileHref} className="rg-diff-path-link" title={linkTitle ?? undefined}>
              {path}
            </a>
          ) : (
            path
          )}
        </code>
        <span className="rg-diff-stats">
          <span className="rg-add">+{file.additions}</span>{" "}
          <span className="rg-rem">-{file.deletions}</span>
        </span>
      </header>

      {file.binary ? (
        <p className="rg-blob-empty">Binary file — no patch rendered.</p>
      ) : file.hunks.length === 0 ? (
        <p className="rg-blob-empty">
          No content change ({file.mode}). Mode-only or rename-only diff.
        </p>
      ) : variant === "split" ? (
        <HunksSplit hunks={file.hunks} />
      ) : (
        <HunksInline hunks={file.hunks} />
      )}
    </article>
  );
}

/**
 * @param {{ hunks: import("@level0x40/react-git/source").SourceDiffHunk[] }} props
 */
function HunksInline({ hunks }) {
  return (
    <div className="rg-hunks rg-hunks-inline">
      {hunks.map((hunk, hi) => (
        <Suspense key={hi} fallback={null}>
          <HunkBlockInline hunk={hunk} />
        </Suspense>
      ))}
    </div>
  );
}

/**
 * @param {{ hunks: import("@level0x40/react-git/source").SourceDiffHunk[] }} props
 */
function HunksSplit({ hunks }) {
  return (
    <div className="rg-hunks rg-hunks-split">
      {hunks.map((hunk, hi) => (
        <Suspense key={hi} fallback={null}>
          <HunkBlockSplit hunk={hunk} />
        </Suspense>
      ))}
    </div>
  );
}

/**
 * Lines per Suspense-wrapped `<tbody>` chunk inside a hunk. Above this
 * threshold, a hunk gets sliced into multiple `<tbody>`s so React can
 * flush incrementally — Shiki tokens triple the byte cost per line, so
 * a single 2k-line hunk easily clears the 512 KB streaming-chunk
 * threshold without subdivision.
 *
 * Multiple `<tbody>` inside one `<table>` is valid HTML and renders
 * identically in all browsers.
 */
const HUNK_LINES_PER_CHUNK = 200;

/**
 * Decorate a hunk's lines with their old/new display numbers.
 * Stream line numbers as we walk lines: contexts advance both, adds
 * advance only the new counter, removes only the old counter.
 *
 * Computed independently for inline + split since each runs in its
 * own server subtree. Cost is `O(lines)` and negligible compared to
 * the actual render — duplicating it is simpler than threading the
 * decorated array through both components.
 *
 * @param {import("@level0x40/react-git/source").SourceDiffHunk} hunk
 * @returns {DecoratedLine[]}
 */
function decorate(hunk) {
  /** @type {DecoratedLine[]} */
  const decorated = [];
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;
  for (const line of hunk.lines) {
    const ln = renderLineNumbers(line, oldLine, newLine);
    oldLine = ln.nextOld;
    newLine = ln.nextNew;
    decorated.push({
      line,
      oldDisplay: ln.oldDisplay,
      newDisplay: ln.newDisplay,
    });
  }
  return decorated;
}

/**
 * Hunk header — the `@@ -a,b +c,d @@` range plus the optional
 * function-context tail. Shared between inline and split blocks so
 * the split view doesn't lose the orientation cue.
 *
 * @param {{ hunk: import("@level0x40/react-git/source").SourceDiffHunk }} props
 */
function HunkHeader({ hunk }) {
  return (
    <div className="rg-hunk-header">
      <span className="rg-hunk-range">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </span>
      {hunk.header ? <span className="rg-hunk-context">{hunk.header}</span> : null}
    </div>
  );
}

/**
 * Inline (unified) hunk: existing 4-column row layout.
 *
 * @param {{ hunk: import("@level0x40/react-git/source").SourceDiffHunk }} props
 */
function HunkBlockInline({ hunk }) {
  const decorated = decorate(hunk);
  const chunks = [];
  for (let i = 0; i < decorated.length; i += HUNK_LINES_PER_CHUNK) {
    chunks.push(decorated.slice(i, i + HUNK_LINES_PER_CHUNK));
  }
  const useSuspense = decorated.length > HUNK_LINES_PER_CHUNK;

  return (
    <div className="rg-hunk">
      <HunkHeader hunk={hunk} />
      <table className="rg-hunk-table">
        {chunks.map((chunk, ci) => {
          const tbody = (
            <tbody>
              {chunk.map((d, li) => (
                <DiffLineRow key={li} {...d} />
              ))}
            </tbody>
          );
          return useSuspense ? (
            <Suspense key={ci} fallback={null}>
              {tbody}
            </Suspense>
          ) : (
            tbody
          );
        })}
      </table>
    </div>
  );
}

/**
 * Split-view hunk: paired side-by-side rows. See pairForSplit for
 * the pairing rules; same chunking/Suspense strategy as inline.
 *
 * @param {{ hunk: import("@level0x40/react-git/source").SourceDiffHunk }} props
 */
function HunkBlockSplit({ hunk }) {
  const decorated = decorate(hunk);
  const splitRows = pairForSplit(decorated);
  const splitChunks = [];
  for (let i = 0; i < splitRows.length; i += HUNK_LINES_PER_CHUNK) {
    splitChunks.push(splitRows.slice(i, i + HUNK_LINES_PER_CHUNK));
  }
  const useSuspense = splitRows.length > HUNK_LINES_PER_CHUNK;

  return (
    <div className="rg-hunk">
      <HunkHeader hunk={hunk} />
      <table className="rg-hunk-table rg-hunk-split-table">
        {splitChunks.map((chunk, ci) => {
          const tbody = (
            <tbody>
              {chunk.map((row, li) => (
                <SplitLineRow key={li} left={row.left} right={row.right} />
              ))}
            </tbody>
          );
          return useSuspense ? (
            <Suspense key={ci} fallback={null}>
              {tbody}
            </Suspense>
          ) : (
            tbody
          );
        })}
      </table>
    </div>
  );
}

/**
 * @typedef {{
 *   line: import("@level0x40/react-git/source").SourceDiffLine,
 *   oldDisplay: string,
 *   newDisplay: string,
 * }} DecoratedLine
 *
 * @typedef {{ left: DecoratedLine | null, right: DecoratedLine | null }} SplitPair
 */

/**
 * Pair decorated lines for split-view rendering. The contract:
 *
 *   context → row({ left: d, right: d })   (mirrored)
 *   remove  → buffered, flushed on next non-remove
 *   add     → buffered, flushed on next non-add
 *
 * When a context line (or end-of-hunk) interrupts a remove/add buffer,
 * we zip the two buffers into pair rows: row[i] = (removes[i] || null,
 * adds[i] || null). If the buffers have unequal lengths the shorter
 * side gets a `null` cell — which the renderer styles as a "nothing
 * on this side" placeholder so the other column still aligns under
 * neighboring context rows.
 *
 * This intentionally pairs by index, not by similarity. A "smart"
 * pairing (Myers-style intra-line diff) would be nicer for renames or
 * tweaked lines, but is well outside the scope here. Index pairing is
 * what GitHub and most diff viewers do, and it's predictable.
 *
 * @param {readonly DecoratedLine[]} decorated
 * @returns {SplitPair[]}
 */
function pairForSplit(decorated) {
  /** @type {SplitPair[]} */
  const rows = [];
  /** @type {DecoratedLine[]} */
  let removes = [];
  /** @type {DecoratedLine[]} */
  let adds = [];

  const flushChanges = () => {
    const len = Math.max(removes.length, adds.length);
    for (let i = 0; i < len; i++) {
      rows.push({ left: removes[i] ?? null, right: adds[i] ?? null });
    }
    removes = [];
    adds = [];
  };

  for (const d of decorated) {
    if (d.line.kind === "context") {
      flushChanges();
      rows.push({ left: d, right: d });
    } else if (d.line.kind === "remove") {
      removes.push(d);
    } else if (d.line.kind === "add") {
      adds.push(d);
    }
  }
  flushChanges();
  return rows;
}

/**
 * Split-view row: 4 cells (leftLn, leftText, rightLn, rightText). Each
 * side carries the row class for its line kind so CSS can tint it
 * (remove-red on the left, add-green on the right, or both on a
 * context row). A `null` side renders as a placeholder cell pair
 * tinted to "absent" — keeps row heights aligned across columns.
 *
 * @param {{ left: DecoratedLine | null, right: DecoratedLine | null }} props
 */
function SplitLineRow({ left, right }) {
  const leftKind = left ? left.line.kind : "empty";
  const rightKind = right ? right.line.kind : "empty";
  return (
    <tr className="rg-split-row">
      <td className={`rg-ln rg-ln-old rg-split-cell rg-split-${leftKind}`}>
        {left ? left.oldDisplay : ""}
      </td>
      <td className={`rg-line-text rg-split-cell rg-split-${leftKind}`}>
        {left ? <SplitLineContent line={left.line} /> : null}
      </td>
      <td className={`rg-ln rg-ln-new rg-split-cell rg-split-${rightKind}`}>
        {right ? right.newDisplay : ""}
      </td>
      <td className={`rg-line-text rg-split-cell rg-split-${rightKind}`}>
        {right ? <SplitLineContent line={right.line} /> : null}
      </td>
    </tr>
  );
}

/**
 * Tiny shared body for each split cell. Mirrors the inline view's
 * "highlighted-or-plain" branch — same `line.html` (inner Shiki
 * tokens) goes through `dangerouslySetInnerHTML`, fallback to plain
 * text for unhighlighted rows.
 *
 * @param {{ line: import("@level0x40/react-git/source").SourceDiffLine }} props
 */
function SplitLineContent({ line }) {
  if (line.html) {
    return (
      <code
        className="rg-shiki-line"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: line.html }}
      />
    );
  }
  return <code>{line.text || " "}</code>;
}

/**
 * @param {{
 *   line: import("@level0x40/react-git/source").SourceDiffLine,
 *   oldDisplay: string,
 *   newDisplay: string,
 * }} props
 */
function DiffLineRow({ line, oldDisplay, newDisplay }) {
  return (
    <tr className={`rg-line rg-line-${line.kind}`}>
      <td className="rg-ln rg-ln-old">{oldDisplay}</td>
      <td className="rg-ln rg-ln-new">{newDisplay}</td>
      <td className="rg-line-marker">{markerFor(line.kind)}</td>
      <td className="rg-line-text">
        {/* Highlighted path: `line.html` is just the inner Shiki token
            spans (no wrapper) so we drop them straight into the
            existing <code>. Falls back to plain text when language is
            unsupported or the highlighter declined. */}
        {line.html ? (
          <code
            className="rg-shiki-line"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: line.html }}
          />
        ) : (
          <code>{line.text || " "}</code>
        )}
      </td>
    </tr>
  );
}

/**
 * @param {import("@level0x40/react-git/source").SourceDiffLine} line
 * @param {number} oldLine
 * @param {number} newLine
 */
function renderLineNumbers(line, oldLine, newLine) {
  switch (line.kind) {
    case "context":
      return {
        oldDisplay: String(oldLine),
        newDisplay: String(newLine),
        nextOld: oldLine + 1,
        nextNew: newLine + 1,
      };
    case "add":
      return {
        oldDisplay: "",
        newDisplay: String(newLine),
        nextOld: oldLine,
        nextNew: newLine + 1,
      };
    case "remove":
      return {
        oldDisplay: String(oldLine),
        newDisplay: "",
        nextOld: oldLine + 1,
        nextNew: newLine,
      };
  }
}

/** @param {import("@level0x40/react-git/source").SourceDiffLineKind} kind */
function markerFor(kind) {
  return kind === "add" ? "+" : kind === "remove" ? "-" : " ";
}

/**
 * Last path segment for icon dispatch in the diff per-file header.
 * Same rationale as BlobView's `basenameOf` — `FileIcon` matches
 * `package.json`/`Dockerfile`/etc. by exact name, so passing a
 * full path would fall through to the generic file icon.
 *
 * @param {string} path
 */
function basenameOf(path) {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? path : path.slice(slash + 1);
}

/** @param {import("@level0x40/react-git/source").SourceDiffFileMode} mode */
function modeBadgeLabel(mode) {
  return mode === "added"
    ? "A"
    : mode === "deleted"
      ? "D"
      : mode === "renamed"
        ? "R"
        : mode === "copied"
          ? "C"
          : "M";
}
