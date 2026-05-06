/**
 * Colored, filled file-type icons — VSCode Material Icon Theme axis.
 * Each kind has a brand-recognizable color and either a high-
 * contrast letter chip or a filled pictogram. No more thin
 * monochrome line drawings — these are meant to be readable at a
 * glance from across the screen.
 *
 * All icons use a 16×16 viewBox with rounded-square chip backdrops
 * (rx 2.5 ≈ 10% radius, matches the chip rhythm) so they share a
 * common silhouette regardless of the per-kind glyph inside.
 *
 * Dispatch model:
 *
 *   <FileIcon kind="tree" />            // folder (yellow)
 *   <FileIcon kind="commit" />          // submodule
 *   <FileIcon kind="up" />              // parent-link
 *   <FileIcon kind="blob" name="x.ts" />// file — by basename
 *   <FileIcon kind="branch" />          // git branch (violet)
 *   <FileIcon kind="tag" />             // git tag (emerald)
 *   <FileIcon kind="git-commit" />      // commit hash marker (cyan)
 *   ...
 */

/**
 * @typedef {"file"|"js"|"ts"|"jsx"|"tsx"|"json"|"html"|"css"|"vue"|"svelte"
 *   |"markdown"|"text"|"image"|"svg"|"video"|"audio"|"pdf"|"archive"|"font"
 *   |"lock"|"git"|"env"|"config"|"package"|"docker"|"shell"|"database"
 *   |"code"|"readme"|"license"|"make"} FileKind
 */

/**
 * @param {{
 *   kind: "tree" | "blob" | "commit" | "up"
 *       | "branch" | "tag" | "git-commit" | "clock" | "user" | "home"
 *       | "log" | "refs" | "files" | "tags",
 *   name?: string,
 * }} props
 */
export default function FileIcon({ kind, name }) {
  if (kind === "tree" || kind === "files") return <Folder />;
  if (kind === "commit") return <Submodule />;
  if (kind === "up") return <Up />;
  if (kind === "branch" || kind === "refs") return <Branch />;
  if (kind === "tag" || kind === "tags") return <Tag />;
  if (kind === "git-commit") return <GitCommit />;
  if (kind === "log") return <ListLines />;
  if (kind === "clock") return <Clock />;
  if (kind === "user") return <User />;
  if (kind === "home") return <Home />;
  return <FileGlyph kind={fileKindFor(name ?? "")} />;
}

/* ── Building blocks ──────────────────────────────────────────── */

/**
 * Common chip backdrop — rounded square filled with the kind's
 * brand color. Children draw on top in white (or kind-specific
 * contrast color via the `fg` prop).
 */
function Chip({ bg, children }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="rg-glyph" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" fill={bg} />
      {children}
    </svg>
  );
}

/**
 * Centered mono letters inside a chip. Auto-scales font size based on
 * label length: 1 char ≈ 11px, 2 chars ≈ 8.5px, 3+ chars ≈ 6.5px in
 * the 16×16 viewBox. Letters are bold-heavy so they read at any
 * rendered size.
 */
function Letters({ children, fg = "#fff" }) {
  const len = String(children).length;
  const size = len === 1 ? 11 : len === 2 ? 8.5 : 6.4;
  const y = len === 1 ? 11.7 : len === 2 ? 11.2 : 10.6;
  return (
    <text
      x="8"
      y={y}
      textAnchor="middle"
      fontFamily='"Geist Mono", "JetBrains Mono", ui-monospace, monospace'
      fontSize={size}
      fontWeight="800"
      fill={fg}
      letterSpacing="-0.04em"
    >
      {children}
    </text>
  );
}

/* ── File-type icons ──────────────────────────────────────────── */

/** @param {{ kind: FileKind }} props */
function FileGlyph({ kind }) {
  switch (kind) {
    /* Languages — letter chips, language brand colors */
    case "js":
      return (
        <Chip bg="#f7df1e">
          <Letters fg="#000">JS</Letters>
        </Chip>
      );
    case "ts":
      return (
        <Chip bg="#3178c6">
          <Letters>TS</Letters>
        </Chip>
      );
    case "jsx":
      return (
        <Chip bg="#61dafb">
          <Letters fg="#000">JSX</Letters>
        </Chip>
      );
    case "tsx":
      return (
        <Chip bg="#3178c6">
          <Letters>TSX</Letters>
        </Chip>
      );
    case "json":
      return (
        <Chip bg="#fbbf24">
          <Letters fg="#1f1f1f">{"{}"}</Letters>
        </Chip>
      );
    case "html":
      return (
        <Chip bg="#e34f26">
          <Letters>{"</>"}</Letters>
        </Chip>
      );
    case "css":
      return (
        <Chip bg="#1572b6">
          <Letters>#</Letters>
        </Chip>
      );
    case "vue":
      return (
        <Chip bg="#42b883">
          <Letters>V</Letters>
        </Chip>
      );
    case "svelte":
      return (
        <Chip bg="#ff3e00">
          <Letters>S</Letters>
        </Chip>
      );

    /* Markup / text */
    case "markdown":
      return (
        <Chip bg="#0ea5e9">
          <Letters>MD</Letters>
        </Chip>
      );
    case "text":
      return (
        <Chip bg="#94a3b8">
          <g stroke="#fff" strokeWidth="1.2" strokeLinecap="round">
            <line x1="4.5" y1="6" x2="11.5" y2="6" />
            <line x1="4.5" y1="9" x2="11.5" y2="9" />
            <line x1="4.5" y1="12" x2="9" y2="12" />
          </g>
        </Chip>
      );

    /* Media */
    case "image":
      return (
        <Chip bg="#10b981">
          <g fill="none" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round">
            <circle cx="6" cy="6.5" r="1" fill="#fff" />
            <path d="M3 11.5l3-3 2.5 2.5L11 8l2 2v3H3z" fill="#fff" stroke="none" />
          </g>
        </Chip>
      );
    case "svg":
      return (
        <Chip bg="#fb923c">
          <Letters>SVG</Letters>
        </Chip>
      );
    case "video":
      return (
        <Chip bg="#f97316">
          <path d="M6 5l5.5 3.5L6 12z" fill="#fff" />
        </Chip>
      );
    case "audio":
      return (
        <Chip bg="#ec4899">
          <g fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round">
            <path d="M5 9.5q1-3 2-3 1.5 0 1.5-3t1.5-3q1 0 2 3" />
            <path d="M5 12q1-3 2-3 1.5 0 1.5-3t1.5-3q1 0 2 3" opacity="0.6" />
          </g>
        </Chip>
      );

    /* Documents / archives */
    case "pdf":
      return (
        <Chip bg="#dc2626">
          <Letters>PDF</Letters>
        </Chip>
      );
    case "archive":
      return (
        <Chip bg="#a78bfa">
          <g fill="#fff">
            <rect x="7.2" y="3" width="1.6" height="1.4" />
            <rect x="7.2" y="4.8" width="1.6" height="1.4" />
            <rect x="7.2" y="6.6" width="1.6" height="1.4" />
            <rect x="7.2" y="8.4" width="1.6" height="1.4" />
            <path d="M5.5 10.5h5l-0.5 2.5h-4z" />
          </g>
        </Chip>
      );
    case "font":
      return (
        <Chip bg="#475569">
          <text
            x="8"
            y="12"
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontSize="11"
            fontWeight="700"
            fontStyle="italic"
            fill="#fff"
          >
            Aa
          </text>
        </Chip>
      );

    /* System / config */
    case "lock":
      return (
        <Chip bg="#fbbf24">
          <g fill="none" stroke="#1f1f1f" strokeWidth="1.4" strokeLinejoin="round">
            <rect x="4.5" y="7.5" width="7" height="5" rx="0.6" fill="#1f1f1f" />
            <path d="M5.8 7.5V6a2.2 2.2 0 014.4 0v1.5" />
            <circle cx="8" cy="10" r="0.7" fill="#fbbf24" stroke="none" />
          </g>
        </Chip>
      );
    case "git":
      return (
        <Chip bg="#f4511e">
          <g
            stroke="#fff"
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="5.5" cy="4.5" r="1.2" fill="#fff" />
            <circle cx="5.5" cy="11.5" r="1.2" fill="#fff" />
            <circle cx="10.5" cy="8" r="1.2" fill="#fff" />
            <path d="M5.5 5.7v4.6M5.5 8.5C5.5 7 10.5 8 10.5 6.8" />
          </g>
        </Chip>
      );
    case "env":
      return (
        <Chip bg="#facc15">
          <g
            fill="none"
            stroke="#1f1f1f"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="6" cy="11" r="1.4" fill="#1f1f1f" />
            <path d="M7.4 10l4-4M9.5 7.5l1.2 1.2M10.4 6.6l1.2 1.2" />
          </g>
        </Chip>
      );
    case "config":
      return (
        <Chip bg="#64748b">
          <g fill="none" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round">
            <circle cx="8" cy="8" r="1.8" />
            <path
              d="M8 3v2M8 11v2M3 8h2M11 8h2M4.5 4.5l1.4 1.4M10.1 10.1l1.4 1.4M4.5 11.5l1.4-1.4M10.1 5.9l1.4-1.4"
              strokeLinecap="round"
            />
          </g>
        </Chip>
      );
    case "package":
      return (
        <Chip bg="#cb3837">
          <Letters>npm</Letters>
        </Chip>
      );
    case "docker":
      return (
        <Chip bg="#0db7ed">
          <g fill="#fff">
            <rect x="3" y="9" width="1.6" height="1.6" />
            <rect x="4.9" y="9" width="1.6" height="1.6" />
            <rect x="6.8" y="9" width="1.6" height="1.6" />
            <rect x="8.7" y="9" width="1.6" height="1.6" />
            <rect x="4.9" y="7.1" width="1.6" height="1.6" />
            <rect x="6.8" y="7.1" width="1.6" height="1.6" />
            <rect x="6.8" y="5.2" width="1.6" height="1.6" />
            <path
              d="M2 11.2h10.5q1.7 0 1.7-1.7"
              stroke="#fff"
              strokeWidth="0.9"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        </Chip>
      );
    case "shell":
      return (
        <Chip bg="#0f172a">
          <g
            stroke="#4ade80"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            <path d="M3.5 6l2 2-2 2" />
            <line x1="7" y1="11" x2="12" y2="11" />
          </g>
        </Chip>
      );
    case "database":
      return (
        <Chip bg="#0891b2">
          <g fill="none" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round">
            <ellipse cx="8" cy="4.5" rx="3.5" ry="1.2" fill="#fff" />
            <path d="M4.5 4.5v7c0 .7 1.6 1.2 3.5 1.2s3.5-.5 3.5-1.2v-7" stroke="#fff" />
            <path d="M4.5 7c0 .7 1.6 1.2 3.5 1.2s3.5-.5 3.5-1.2M4.5 9.5c0 .7 1.6 1.2 3.5 1.2s3.5-.5 3.5-1.2" />
          </g>
        </Chip>
      );

    /* Generic */
    case "code":
      return (
        <Chip bg="#94a3b8">
          <Letters>{"</>"}</Letters>
        </Chip>
      );
    case "readme":
      return (
        <Chip bg="#0ea5e9">
          <g fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round">
            <line x1="4.5" y1="5.5" x2="11.5" y2="5.5" />
            <line x1="4.5" y1="8" x2="11.5" y2="8" />
            <line x1="4.5" y1="10.5" x2="9" y2="10.5" />
            <line x1="4.5" y1="13" x2="11" y2="13" />
          </g>
        </Chip>
      );
    case "license":
      return (
        <Chip bg="#fbbf24">
          <g
            fill="none"
            stroke="#1f1f1f"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="6.5" r="1.6" fill="#1f1f1f" />
            <path d="M5.5 13l2-3.5h1l2 3.5-1.5-1-1 1.2-1-1.2z" fill="#1f1f1f" />
          </g>
        </Chip>
      );
    case "make":
      return (
        <Chip bg="#84cc16">
          <g
            fill="none"
            stroke="#1f1f1f"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 12l3-3M11 5.5a1.6 1.6 0 11-2.2 2.2L6 10.5l1.5 1.5L10.5 9a1.6 1.6 0 002.2-2.2z" />
          </g>
        </Chip>
      );
    case "file":
    default:
      return (
        <Chip bg="#94a3b8">
          <path d="M5 3.5h4l3 3v6.5a0.5 0.5 0 01-0.5 0.5h-6.5a0.5 0.5 0 01-0.5-0.5z" fill="#fff" />
          <path d="M9 3.5v3h3" stroke="#94a3b8" strokeWidth="0.9" fill="none" />
        </Chip>
      );
  }
}

/* ── Special-shape icons (folders, semantic markers) ─────────── */

/** Folder — classic yellow folder with darker back tab. */
function Folder() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="rg-glyph" aria-hidden="true">
      <path
        d="M1.5 4.5a1 1 0 011-1h3.2l1.5 1.4h7.3a1 1 0 011 1v7a1 1 0 01-1 1h-12a1 1 0 01-1-1z"
        fill="#eab308"
      />
      <path
        d="M1.5 6a1 1 0 011-1h11a1 1 0 011 1v6.5a1 1 0 01-1 1h-11a1 1 0 01-1-1z"
        fill="#facc15"
      />
    </svg>
  );
}

/** Submodule — outline + crosshair, neutral gray (linked external repo). */
function Submodule() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="rg-glyph" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" fill="#475569" />
      <g stroke="#fff" strokeWidth="1.3" fill="none">
        <circle cx="8" cy="8" r="2.5" />
        <path d="M8 2v2.5M8 11.5V14M2 8h2.5M11.5 8H14" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** "Go to parent" arrow — neutral. */
function Up() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="rg-glyph" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" fill="#64748b" />
      <path
        d="M8 12V5M5 8l3-3 3 3"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Branch — violet, bold node-and-line. */
function Branch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="rg-glyph" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" fill="#a855f7" />
      <g fill="#fff" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="4" r="1.4" />
        <circle cx="5" cy="12" r="1.4" />
        <circle cx="11" cy="7" r="1.4" />
        <path d="M5 5.4v5.2M5 10.5C5 8 11 9 11 8.4" fill="none" />
      </g>
    </svg>
  );
}

/** Tag — emerald with classic price-tag silhouette. */
function Tag() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="rg-glyph" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" fill="#10b981" />
      <g fill="#fff" stroke="#fff" strokeWidth="0.6" strokeLinejoin="round">
        <path d="M2.8 8.2L7.2 3.8a1 1 0 01.7-0.3h3.6a0.7 0.7 0 010.7 0.7v3.6a1 1 0 01-0.3 0.7l-4.4 4.4a1 1 0 01-1.4 0L2.8 9.6a1 1 0 010-1.4z" />
        <circle cx="9.7" cy="6.3" r="0.9" fill="#10b981" stroke="none" />
      </g>
    </svg>
  );
}

/** Git commit — cyan timeline marker (circle on a line). */
function GitCommit() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="rg-glyph" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" fill="#06b6d4" />
      <g stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <line x1="2.5" y1="8" x2="5" y2="8" />
        <line x1="11" y1="8" x2="13.5" y2="8" />
        <circle cx="8" cy="8" r="2.5" fill="#fff" />
        <circle cx="8" cy="8" r="1" fill="#06b6d4" stroke="none" />
      </g>
    </svg>
  );
}

/** List with bullets — slate, for "log" / commit history HUD nav. */
function ListLines() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="rg-glyph" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" fill="#64748b" />
      <g stroke="#fff" strokeWidth="1.2" fill="#fff" strokeLinecap="round">
        <circle cx="3.5" cy="4.5" r="0.9" stroke="none" />
        <circle cx="3.5" cy="8" r="0.9" stroke="none" />
        <circle cx="3.5" cy="11.5" r="0.9" stroke="none" />
        <line x1="6" y1="4.5" x2="13" y2="4.5" />
        <line x1="6" y1="8" x2="13" y2="8" />
        <line x1="6" y1="11.5" x2="10" y2="11.5" />
      </g>
    </svg>
  );
}

/** Clock — slate, for date/timestamp markers. */
function Clock() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="rg-glyph" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" fill="#475569" />
      <g stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="4.5" />
        <path d="M8 5V8l2 1.5" />
      </g>
    </svg>
  );
}

/** Person silhouette — slate, for author markers. */
function User() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="rg-glyph" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" fill="#475569" />
      <g fill="#fff" stroke="#fff" strokeWidth="0.4">
        <circle cx="8" cy="6" r="2.2" />
        <path d="M3.5 13.5c0.6-2.5 2.6-3.7 4.5-3.7s3.9 1.2 4.5 3.7z" />
      </g>
    </svg>
  );
}

/** House outline — for project-root crumbs. */
function Home() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="rg-glyph" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" fill="#475569" />
      <path d="M3 8.2L8 4l5 4.2V13H9.5v-3h-3v3H3z" fill="#fff" />
    </svg>
  );
}

// ── Dispatch tables ───────────────────────────────────────────────

/** Exact filename match → kind. Order doesn't matter, all distinct keys. */
const NAME_KIND = /** @type {Record<string, FileKind>} */ ({
  "package.json": "package",
  "package-lock.json": "lock",
  "pnpm-lock.yaml": "lock",
  "yarn.lock": "lock",
  "bun.lockb": "lock",
  "bun.lock": "lock",
  "deno.lock": "lock",
  "Cargo.toml": "package",
  "Cargo.lock": "lock",
  Gemfile: "package",
  "Gemfile.lock": "lock",
  "go.mod": "package",
  "go.sum": "lock",
  "pyproject.toml": "package",
  Pipfile: "package",
  "Pipfile.lock": "lock",
  "tsconfig.json": "config",
  "jsconfig.json": "config",
  "tsconfig.build.json": "config",
  ".eslintrc": "config",
  ".eslintrc.js": "config",
  ".eslintrc.json": "config",
  ".prettierrc": "config",
  ".prettierrc.json": "config",
  ".babelrc": "config",
  ".editorconfig": "config",
  ".browserslistrc": "config",
  ".nvmrc": "config",
  ".node-version": "config",
  "vite.config.js": "config",
  "vite.config.ts": "config",
  "vitest.config.js": "config",
  "vitest.config.ts": "config",
  "rollup.config.js": "config",
  "webpack.config.js": "config",
  ".gitignore": "git",
  ".gitattributes": "git",
  ".gitmodules": "git",
  ".gitkeep": "git",
  ".env": "env",
  Dockerfile: "docker",
  "docker-compose.yml": "docker",
  "docker-compose.yaml": "docker",
  ".dockerignore": "docker",
  Makefile: "make",
  makefile: "make",
  GNUmakefile: "make",
  README: "readme",
  "README.md": "readme",
  "README.txt": "readme",
  "README.rst": "readme",
  CHANGELOG: "readme",
  "CHANGELOG.md": "readme",
  "HISTORY.md": "readme",
  LICENSE: "license",
  "LICENSE.md": "license",
  "LICENSE.txt": "license",
  COPYING: "license",
  COPYRIGHT: "license",
  AUTHORS: "license",
  CONTRIBUTORS: "license",
  NOTICE: "license",
});

/** Extension (lowercased, no leading dot) → kind. */
const EXTENSION_KIND = /** @type {Record<string, FileKind>} */ ({
  // JS family
  js: "js",
  mjs: "js",
  cjs: "js",
  ts: "ts",
  mts: "ts",
  cts: "ts",
  jsx: "jsx",
  tsx: "tsx",
  // Web markup / styling
  html: "html",
  htm: "html",
  xhtml: "html",
  xml: "html",
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",
  styl: "css",
  postcss: "css",
  vue: "vue",
  svelte: "svelte",
  // Data
  json: "json",
  jsonc: "json",
  json5: "json",
  ndjson: "json",
  yml: "config",
  yaml: "config",
  toml: "config",
  ini: "config",
  conf: "config",
  cfg: "config",
  // Markup/text
  md: "markdown",
  mdx: "markdown",
  markdown: "markdown",
  txt: "text",
  log: "text",
  rst: "text",
  adoc: "text",
  // Other languages (all generic code unless specifically iconed)
  go: "code",
  rs: "code",
  py: "code",
  rb: "code",
  php: "code",
  java: "code",
  kt: "code",
  scala: "code",
  clj: "code",
  cljs: "code",
  swift: "code",
  c: "code",
  h: "code",
  cpp: "code",
  hpp: "code",
  cc: "code",
  cs: "code",
  fs: "code",
  ml: "code",
  lua: "code",
  zig: "code",
  nim: "code",
  dart: "code",
  ex: "code",
  exs: "code",
  // Shell
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  bat: "shell",
  cmd: "shell",
  ps1: "shell",
  // Database
  sql: "database",
  db: "database",
  sqlite: "database",
  sqlite3: "database",
  // Images
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  ico: "image",
  bmp: "image",
  tiff: "image",
  heic: "image",
  svg: "svg",
  // Video
  mp4: "video",
  webm: "video",
  mov: "video",
  mkv: "video",
  avi: "video",
  m4v: "video",
  // Audio
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  flac: "audio",
  m4a: "audio",
  aac: "audio",
  // Documents
  pdf: "pdf",
  // Archives
  zip: "archive",
  tar: "archive",
  gz: "archive",
  tgz: "archive",
  bz2: "archive",
  xz: "archive",
  "7z": "archive",
  rar: "archive",
  zst: "archive",
  // Fonts
  woff: "font",
  woff2: "font",
  ttf: "font",
  otf: "font",
  eot: "font",
  // Lock
  lock: "lock",
});

/**
 * @param {string} name
 * @returns {FileKind}
 */
function fileKindFor(name) {
  if (!name) return "file";
  if (NAME_KIND[name]) return NAME_KIND[name];

  if (name.startsWith(".env.")) return "env";
  if (name.startsWith("Dockerfile.") || name.endsWith(".dockerfile")) {
    return "docker";
  }
  if (name.endsWith(".d.ts")) return "ts";

  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "file";
  const ext = name.slice(dot + 1).toLowerCase();
  return EXTENSION_KIND[ext] ?? "file";
}

/** Re-exported for use in non-tree contexts (diff summary, crumbs). */
export { fileKindFor };
