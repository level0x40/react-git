/**
 * primer FileIcon — octicon-style monochrome SVGs.
 *
 * Octicons are GitHub's icon set. Their core visual properties:
 *
 *   - 16×16 base grid (same as our viewBox)
 *   - Monochrome — single fill, color: currentColor (inherits text)
 *   - No drop shadows, no gradients, no rounded squares
 *   - Geometric, evenly weighted strokes
 *
 * The shapes here are simplified octicons-equivalent — close enough
 * to be evocative without claiming to BE octicons. Inlining keeps
 * the package zero-deps; pulling `@primer/octicons-react` would
 * mean adding a dep and a build step.
 *
 * Color handling: every shape uses `fill="currentColor"`. The
 * default theme overrode `.rg-glyph` with hard-coded colors per
 * kind; primer instead lets the surrounding text color flow
 * through, matching how octicons behave on github.com (icons
 * inherit muted/default/danger/etc. depending on context).
 *
 * No `name` dispatch by extension here. GitHub's file rows use the
 * same icon for every file regardless of type — type info comes
 * from the filename column. The `name` prop is accepted for
 * signature compat with the default impl but ignored.
 *
 * @param {{
 *   kind: "tree" | "blob" | "commit" | "up"
 *       | "branch" | "tag" | "git-commit" | "clock" | "user" | "home"
 *       | "log" | "refs" | "files" | "tags",
 *   name?: string,
 * }} props
 */
export default function FileIcon({ kind }) {
  switch (kind) {
    case "tree":
    case "files":
      return <FileDirectory />;
    case "blob":
      return <File />;
    case "commit":
      return <Submodule />;
    case "up":
      return <ChevronUp />;
    case "branch":
    case "refs":
      return <GitBranch />;
    case "tag":
    case "tags":
      return <Tag />;
    case "git-commit":
      return <GitCommit />;
    case "log":
      return <ListUnordered />;
    case "clock":
      return <Clock />;
    case "user":
      return <Person />;
    case "home":
      return <Home />;
    default:
      return <File />;
  }
}

/**
 * Shared `<svg>` shell. width/height pinned to 16 so the icons
 * render correctly under templates that don't size .rg-glyph; CSS
 * still wins via specificity if a rule sets it differently.
 *
 * @param {{ children: import("react").ReactNode }} props
 */
function Glyph({ children }) {
  return (
    <svg
      className="rg-glyph"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function FileDirectory() {
  return (
    <Glyph>
      <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 1h3.5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 0 0 .2.1H13.75a1.75 1.75 0 0 1 1.75 1.75v8.5a1.75 1.75 0 0 1-1.75 1.75H1.75A1.75 1.75 0 0 1 0 13.25V2.75c0-.464.184-.91.513-1.237Z" />
    </Glyph>
  );
}

function File() {
  return (
    <Glyph>
      <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
    </Glyph>
  );
}

function Submodule() {
  return (
    <Glyph>
      <path d="M0 2.75C0 1.784.784 1 1.75 1H5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 0 0 .2.1h6.75c.966 0 1.75.784 1.75 1.75v3h-1.5v-3a.25.25 0 0 0-.25-.25h-6.75c-.55 0-1.07-.26-1.4-.7l-.9-1.2a.25.25 0 0 0-.2-.1H1.75a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25H6V15H1.75A1.75 1.75 0 0 1 0 13.25Zm15.75 4.75a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-1.28.53l-2.22-2.22H8.75A1.75 1.75 0 0 1 7 11.25v-2.5C7 7.784 7.784 7 8.75 7Z" />
    </Glyph>
  );
}

function ChevronUp() {
  return (
    <Glyph>
      <path d="M3.22 9.78a.749.749 0 0 1 0-1.06l4.25-4.25a.749.749 0 0 1 1.06 0l4.25 4.25a.749.749 0 1 1-1.06 1.06L8 6.06 4.28 9.78a.749.749 0 0 1-1.06 0Z" />
    </Glyph>
  );
}

function GitBranch() {
  return (
    <Glyph>
      <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
    </Glyph>
  );
}

function Tag() {
  return (
    <Glyph>
      <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .909.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.75 1.75 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
    </Glyph>
  );
}

function GitCommit() {
  return (
    <Glyph>
      <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
    </Glyph>
  );
}

function ListUnordered() {
  return (
    <Glyph>
      <path d="M5.75 2.5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5ZM2 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-6a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM2 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </Glyph>
  );
}

function Clock() {
  return (
    <Glyph>
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z" />
    </Glyph>
  );
}

function Person() {
  return (
    <Glyph>
      <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
    </Glyph>
  );
}

function Home() {
  return (
    <Glyph>
      <path d="M6.906.664a1.749 1.749 0 0 1 2.187 0l5.25 4.2c.415.332.657.835.657 1.367v7.019A1.75 1.75 0 0 1 13.25 15h-3.5a.75.75 0 0 1-.75-.75V9H7v5.25a.75.75 0 0 1-.75.75h-3.5A1.75 1.75 0 0 1 1 13.25V6.23c0-.531.242-1.034.657-1.366l5.25-4.2Zm1.25 1.171a.25.25 0 0 0-.312 0l-5.25 4.2a.25.25 0 0 0-.094.196v7.019c0 .138.112.25.25.25H5.5V8.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v5.25h2.75a.25.25 0 0 0 .25-.25V6.23a.25.25 0 0 0-.094-.195Z" />
    </Glyph>
  );
}
