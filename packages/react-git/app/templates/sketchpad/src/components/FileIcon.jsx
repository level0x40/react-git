/**
 * Sketchpad FileIcon — emoji-based, single-glyph dispatch.
 *
 * Sketchpad is the first built-in template that ships a JSX
 * component override alongside its stylesheet (the others — default,
 * w3c, primer, react-server, tui — are CSS-only and let
 * `virtual:rg/component/FileIcon` fall through to the package's
 * built-in SVG impl). Living here instead of in the impl proves
 * the template-plugin's resolution order works for both file kinds
 * at once:
 *
 *   1. <template-dir>/src/{components,styles}/<Name>.{jsx|css|…}  ← us
 *   2. <package>/app/src/impl/{components,styles}/<Name>.{jsx|…}  ← fallback
 *
 * Every consumer that imports `virtual:rg/component/FileIcon` (the
 * file tree, the diff summary, the breadcrumb leaf, the HUD nav,
 * the commit list) renders these emojis instead of the package's
 * SVG icons whenever sketchpad is the active template.
 *
 * The signature matches the package's built-in `FileIcon`:
 *   - `kind` covers the chrome categories (tree/blob/commit/up,
 *     branch/tag/git-commit, log/clock/user/home, refs/files/tags)
 *   - `name` is consulted only for `kind="blob"` to dispatch by
 *     filename extension; for every other kind the name is ignored.
 *
 * @param {{
 *   kind: "tree" | "blob" | "commit" | "up"
 *       | "branch" | "tag" | "git-commit" | "clock" | "user" | "home"
 *       | "log" | "refs" | "files" | "tags",
 *   name?: string,
 * }} props
 */
export default function FileIcon({ kind, name }) {
  return (
    <span className="rg-glyph rg-glyph-emoji" aria-hidden="true">
      {emojiFor(kind, name)}
    </span>
  );
}

/**
 * Map a (`kind`, `name`) pair to a single emoji codepoint. The
 * blob branch reads the basename's extension; every other kind is
 * a fixed glyph.
 *
 * @param {string} kind
 * @param {string | undefined} name
 * @returns {string}
 */
function emojiFor(kind, name) {
  switch (kind) {
    case "tree":
    case "files":
      return "\u{1F4C1}"; // 📁 file folder
    case "commit":
      return "\u{1F4E6}"; // 📦 package (submodule pointer)
    case "up":
      return "\u{2934}\u{FE0F}"; // ⤴️ curved arrow
    case "branch":
    case "refs":
      return "\u{1F33F}"; // 🌿 herb (branch)
    case "tag":
    case "tags":
      return "\u{1F3F7}\u{FE0F}"; // 🏷️ label
    case "git-commit":
      return "\u{26A1}"; // ⚡ high voltage (commit marker)
    case "log":
      return "\u{1F4DC}"; // 📜 scroll
    case "clock":
      return "\u{1F552}"; // 🕒
    case "user":
      return "\u{1F464}"; // 👤
    case "home":
      return "\u{1F3E0}"; // 🏠
    case "blob":
    default:
      return blobEmojiFor(name ?? "");
  }
}

/**
 * Pick a blob emoji from a filename extension. Falls back to a
 * generic page glyph for unknown extensions.
 *
 * Kept intentionally small — the goal is "visually distinct from
 * the SVG default", not exhaustive language coverage. Add more
 * cases if a project has dominant filetypes that aren't covered.
 *
 * @param {string} name  basename or full path; only the trailing
 *                       extension matters
 * @returns {string}
 */
function blobEmojiFor(name) {
  const lower = name.toLowerCase();
  // Extension match — slice from the LAST dot so dotfiles like
  // `.gitignore` (no extension) fall through to the README/config
  // checks below.
  const dot = lower.lastIndexOf(".");
  const ext = dot > 0 ? lower.slice(dot + 1) : "";
  switch (ext) {
    case "js":
    case "mjs":
    case "cjs":
    case "jsx":
      return "\u{1F7E8}"; // 🟨 yellow square (JS)
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return "\u{1F7E6}"; // 🟦 blue square (TS)
    case "json":
    case "json5":
    case "jsonc":
      return "\u{1F4CB}"; // 📋 clipboard
    case "md":
    case "mdx":
    case "markdown":
      return "\u{1F4DD}"; // 📝 memo
    case "html":
    case "htm":
      return "\u{1F310}"; // 🌐 globe
    case "css":
    case "scss":
    case "sass":
    case "less":
      return "\u{1F3A8}"; // 🎨 palette
    case "py":
      return "\u{1F40D}"; // 🐍 snake
    case "rs":
      return "\u{1F980}"; // 🦀 crab
    case "go":
      return "\u{1F439}"; // 🐹 hamster (gopher stand-in)
    case "rb":
      return "\u{1F48E}"; // 💎
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
      return "\u{1F41A}"; // 🐚 shell
    case "yml":
    case "yaml":
    case "toml":
      return "\u{2699}\u{FE0F}"; // ⚙️ gear (config)
    case "lock":
      return "\u{1F512}"; // 🔒
    case "svg":
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
      return "\u{1F5BC}\u{FE0F}"; // 🖼️ framed picture
    case "mp4":
    case "webm":
    case "mov":
      return "\u{1F3AC}"; // 🎬 clapper
    case "mp3":
    case "wav":
    case "ogg":
    case "flac":
      return "\u{1F3B5}"; // 🎵
    case "pdf":
      return "\u{1F4D5}"; // 📕
    case "zip":
    case "tar":
    case "gz":
    case "tgz":
    case "rar":
    case "7z":
      return "\u{1F4E6}"; // 📦
    default:
      break;
  }
  // Filename heuristics for the common no-extension cases.
  if (lower === "readme" || lower.startsWith("readme.")) return "\u{1F4D6}"; // 📖
  if (lower === "license" || lower.startsWith("license.")) return "\u{1F4DC}"; // 📜
  if (lower === "dockerfile" || lower === "containerfile") return "\u{1F40B}"; // 🐳
  if (lower === ".gitignore" || lower === ".gitattributes") return "\u{1F4DD}"; // 📝
  if (lower.startsWith(".env")) return "\u{1F511}"; // 🔑
  if (lower === "makefile") return "\u{1F528}"; // 🔨
  return "\u{1F4C4}"; // 📄 page facing up — generic fallback
}
