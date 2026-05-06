import { Suspense } from "react";
// Cross-component imports via the virtual indirection — user
// overrides of FileIcon or BlobMediaClient take effect here. See
// template-plugin.js for resolution order.
import FileIcon from "virtual:rg/component/FileIcon";
import {
  BlobBodyShell,
  BlobMediaProvider,
  BlobViewToggle,
} from "virtual:rg/component/BlobMediaClient";

/**
 * Number of Shiki line-spans per Suspense-wrapped chunk in the blob
 * view. Big enough that a typical 200-line file is one boundary
 * (avoiding boundary overhead) but small enough that a 5000-line file
 * fans out into ~25 flushes that each fit comfortably under React's
 * 512 KB streaming-chunk threshold.
 */
const BLOB_LINES_PER_CHUNK = 200;

/**
 * Blob view with format-aware rendering.
 *
 * The runtime (`source-build.js#getBlob`) augments certain files
 * with rendered representations:
 *
 *   - Markdown (`file.bodyHtml`) — markdown-it rendered HTML.
 *   - SVG (`file.mediaUri = data:image/svg+xml;…`) — text content
 *     wrapped in a data URI; embedded via `<img>` so embedded
 *     scripts can't execute.
 *   - Image / audio / video (`file.mediaUri = data:…;base64,…`) —
 *     bytes read fresh from git and inlined as base64 (live mode
 *     only; manifest mode keeps the binary placeholder).
 *
 * When any of those are present, we render a *Rendered ↔ Raw*
 * toggle in the header: by default the user sees the rendered
 * preview (markdown HTML, the image, the playable media); flipping
 * to Raw shows the underlying source (Shiki-highlighted markdown
 * source, SVG XML, or — for opaque binaries — a metadata-only
 * placeholder since there's no useful text source to display).
 *
 * Files without those augmentations fall through to the original
 * Shiki / fallback / binary / oversized rendering — single-pane,
 * no toggle.
 *
 * @param {{ file: import("@level0x40/react-git/source").SourceFile & {
 *   bodyHtml?: string,
 *   mediaUri?: string,
 * } }} props
 */
export default function BlobView({ file }) {
  const renderable = isRenderable(file);
  return (
    <article className="rg-blob">
      {renderable ? (
        <BlobMediaProvider>
          <BlobHeader file={file} />
          {/* Controls row sits between header and body — same shape
              as `.rg-diff-controls` on the commit page so the two
              toggles read as one motif across the app. Right-aligned
              to keep the path/meta line on the left visually heavy. */}
          <div className="rg-blob-controls">
            <BlobViewToggle />
          </div>
          <BlobBodyShell rendered={<RenderedBody file={file} />} raw={<RawBody file={file} />} />
        </BlobMediaProvider>
      ) : (
        <>
          <BlobHeader file={file} />
          <RawBody file={file} />
        </>
      )}
    </article>
  );
}

/** @param {{ file: any }} props */
function BlobHeader({ file }) {
  return (
    <header className="rg-blob-header">
      <span className="rg-blob-path">
        <FileIcon kind="blob" name={basenameOf(file.path)} />
        <span className="rg-blob-path-text">{file.path}</span>
      </span>
      <span className="rg-blob-meta">
        {file.language ? <code>{file.language}</code> : null}
        <span>{formatBytes(file.size)}</span>
        <code className="rg-sha">{file.sha.slice(0, 8)}</code>
      </span>
    </header>
  );
}

/** @param {any} file */
function isRenderable(file) {
  return Boolean(file.bodyHtml) || Boolean(file.mediaUri);
}

/**
 * Rendered preview. Dispatch order: markdown → media (svg/image/
 * audio/video). At most one branch fires; presence of `bodyHtml` or
 * `mediaUri` is the runtime's signal.
 *
 * @param {{ file: any }} props
 */
function RenderedBody({ file }) {
  if (file.bodyHtml) {
    return (
      <div
        className="rg-blob-content rg-blob-content-markdown rg-prose"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: file.bodyHtml }}
      />
    );
  }
  if (file.mediaUri) {
    const kind = mediaKindOf(file.path);
    if (kind === "audio") {
      return (
        <div className="rg-blob-content rg-blob-content-media">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={file.mediaUri} controls preload="metadata" />
        </div>
      );
    }
    if (kind === "video") {
      return (
        <div className="rg-blob-content rg-blob-content-media">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={file.mediaUri} controls preload="metadata" />
        </div>
      );
    }
    // image (incl. SVG via data URI)
    return (
      <div className="rg-blob-content rg-blob-content-media">
        <img src={file.mediaUri} alt={file.path} />
      </div>
    );
  }
  return null;
}

/**
 * Raw / source view. Reuses the Shiki-or-fallback path for text
 * blobs; for binary media there's no useful source to show, so we
 * surface a metadata strip instead of "Binary file" — keeps the
 * toggle's Raw side honest about what the underlying file is.
 *
 * @param {{ file: any }} props
 */
function RawBody({ file }) {
  if (file.binary && file.mediaUri) {
    return (
      <div className="rg-blob-content rg-blob-content-rawmeta">
        <p className="rg-blob-rawmeta-line">
          <span className="rg-blob-rawmeta-label">Binary asset</span>
          <span> — no text source to display.</span>
        </p>
        <dl className="rg-blob-rawmeta">
          <dt>Path</dt>
          <dd>
            <code>{file.path}</code>
          </dd>
          <dt>Size</dt>
          <dd>
            {formatBytes(file.size)} ({file.size.toLocaleString()} bytes)
          </dd>
          <dt>Blob SHA</dt>
          <dd>
            <code>{file.sha}</code>
          </dd>
        </dl>
      </div>
    );
  }
  return <TextBody file={file} />;
}

/**
 * Original text rendering — Shiki-highlighted (chunked into Suspense
 * boundaries for large files), plain-text fallback if Shiki declined,
 * and the binary / oversized placeholder messages.
 *
 * @param {{ file: any }} props
 */
function TextBody({ file }) {
  if (file.binary) {
    return <p className="rg-blob-empty">Binary file — {formatBytes(file.size)} not rendered.</p>;
  }
  if (file.content === null) {
    return (
      <p className="rg-blob-empty">
        File too large to inline ({formatBytes(file.size)}). Skipped during extraction; raise{" "}
        <code>--max-blob-size</code> to include it.
      </p>
    );
  }
  // Highlighted path: file.html is a full Shiki-rendered <pre><code>…
  // string with dual-theme inline styles. We split it into N-line
  // chunks (preserving Shiki's wrapper around each chunk) and render
  // each in its own Suspense boundary. React's streaming SSG flushes
  // per-boundary, which keeps any single chunk well under the 512 KB
  // warning threshold even for very large files.
  if (file.html) {
    const chunks = chunkShikiHtml(file.html, BLOB_LINES_PER_CHUNK);
    return (
      <div className="rg-blob-content rg-shiki-host">
        {chunks.map((html, i) => (
          <Suspense key={i} fallback={null}>
            <div
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </Suspense>
        ))}
      </div>
    );
  }

  // Fallback path: language wasn't supported (or highlighter failed).
  // Same outer structure as the Shiki path so the CSS can share
  // rules: outer .rg-blob-content frames the scroll area with
  // padding, inner <pre> is the scroll container (no padding),
  // <code> is just the content. Content scrolling stays bounded
  // by pre's edges and never bleeds into the padded frame.
  return (
    <div className="rg-blob-content">
      <pre className="rg-blob-fallback">
        <code className={file.language ? `language-${file.language}` : ""}>{file.content}</code>
      </pre>
    </div>
  );
}

/**
 * Coarse media kind by extension — used by `RenderedBody` to pick
 * the right HTML element. Mirrors the runtime's MEDIA_MIME table
 * but only needs to distinguish "audio" vs "video" vs everything
 * else (which renders as `<img>`, including SVG via data URI).
 *
 * @param {string} path
 * @returns {"audio" | "video" | "image"}
 */
function mediaKindOf(path) {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "image";
  const ext = path.slice(dot + 1).toLowerCase();
  if (
    ext === "mp3" ||
    ext === "wav" ||
    ext === "ogg" ||
    ext === "flac" ||
    ext === "m4a" ||
    ext === "aac" ||
    ext === "opus"
  )
    return "audio";
  if (ext === "mp4" || ext === "webm" || ext === "mov" || ext === "m4v") return "video";
  return "image";
}

/**
 * Last path segment — used for icon dispatch in the blob header.
 * `FileIcon` matches by exact name first (e.g. `package.json`) then
 * by extension, so we MUST pass the basename, not the full path,
 * or `src/foo/package.json` would land on the generic file icon.
 *
 * @param {string} path
 */
function basenameOf(path) {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? path : path.slice(slash + 1);
}

/** @param {number} bytes */
function formatBytes(bytes) {
  if (bytes < 0) return "?";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/**
 * Split a Shiki-rendered HTML blob into chunks of `n` lines each,
 * preserving the outer `<pre>…</pre>` wrapper on every chunk so each
 * chunk is independently styled by `.rg-shiki-host pre.shiki` and
 * keeps its line counter scoping (counter-reset is per-`<pre>`).
 *
 * Shiki always emits the shape:
 *
 *   <pre class="shiki …" style="…"><code>
 *     <span class="line">…</span>
 *     <span class="line">…</span>
 *     …
 *   </code></pre>
 *
 * with a literal newline between consecutive `<span class="line">`
 * elements. Splitting on `\n(?=<span class="line">)` carves the body
 * into one entry per source line without breaking nested token spans.
 *
 * Line-number continuity: `<pre.shiki>` carries `counter-reset:
 * rg-blob-line` in the active template's stylesheet (default theme:
 * `app/templates/default/src/styles/main.css`), and each `.line`
 * increments it. Naive chunking restarts the counter at 1 on every
 * chunk because each chunk gets its own `<pre>`. We override the
 * reset on chunks 1..N by inlining `counter-reset: rg-blob-line
 * <offset>` so the next `counter-increment` produces `offset + 1` —
 * yielding 1..n in chunk 0, n+1..2n in chunk 1, and so on. Inline
 * `style` beats the class rule per CSS specificity, so the template
 * stylesheet doesn't need to know about chunking.
 *
 * If the outer regex doesn't match (unexpected output shape), we
 * return the original HTML in a single-element array — graceful
 * degrade rather than throwing mid-render.
 *
 * @param {string} html
 * @param {number} n
 * @returns {string[]}
 */
function chunkShikiHtml(html, n) {
  const m = html.match(/^(<pre[^>]*>)<code>([\s\S]*?)<\/code><\/pre>\s*$/);
  if (!m) return [html];
  const [, openPre, body] = m;
  const lines = body.split(/\n(?=<span class="line">)/);
  if (lines.length <= n) return [html];
  const chunks = [];
  for (let i = 0; i < lines.length; i += n) {
    const slice = lines.slice(i, i + n).join("\n");
    // chunk 0 keeps the template's default counter-reset (to 0 →
    // first .line yields 1). Subsequent chunks need an explicit
    // reset to `i` so `.line`'s increment produces `i + 1` for the
    // first row.
    const openPreWithCounter = i === 0 ? openPre : injectCounterReset(openPre, i);
    chunks.push(`${openPreWithCounter}<code>${slice}</code></pre>`);
  }
  return chunks;
}

/**
 * Append `counter-reset: rg-blob-line <offset>` to the `<pre>` tag's
 * inline `style` attribute. Shiki's standard output always carries a
 * `style="..."` (theme color/background) so the "no style attr"
 * branch is defensive — if it's hit, we add one.
 *
 * @param {string} openPre  e.g. `<pre class="shiki …" style="background:…">`
 * @param {number} offset   counter starting value (chunkIndex * linesPerChunk)
 * @returns {string}
 */
function injectCounterReset(openPre, offset) {
  const decl = `counter-reset:rg-blob-line ${offset}`;
  if (/style="/.test(openPre)) {
    return openPre.replace(/style="([^"]*)"/, (_full, existing) => {
      // Keep the existing declarations; append ours so it wins on
      // last-wins ordering even if Shiki ever emits its own counter
      // declaration upstream of ours.
      const trimmed = existing.replace(/;\s*$/, "");
      return `style="${trimmed};${decl}"`;
    });
  }
  // No style attribute — inject one before the closing `>`.
  return openPre.replace(/>$/, ` style="${decl}">`);
}
