/**
 * @file Stderr logger matching `@lazarv/react-server`'s prefix shape
 * with a distinct tag color so our lines stay visually separable from
 * react-server's in shared scrollback:
 *
 *   <dim>11:31:59 PM</dim> <bold-magenta>[react-git]</bold-magenta> message
 *
 * Time format is en-US (12-hour with AM/PM), matching react-server's
 * Vite-backed logger so timestamps line up across both streams. Tag
 * color is bold-magenta (vs. react-server's bold-cyan) — complementary
 * pair in the 8-color ANSI palette, easy to tell apart at a glance
 * without either tag dominating the eye.
 *
 * Message-body emphasis is via explicit helpers (`path`, `url`, `num`,
 * `name`, `sha`, `dur`, `kw`, `dim`). Call sites mark interesting
 * tokens directly:
 *
 *   log(`extracting ${num(n)}/${num(total)} refs`);
 *   log(`ref ${name(ref.shortName)} (${sha(ref.sha)})`);
 *
 * No regex auto-detect — heuristics confuse counts with shas, durations
 * with byte sizes, paths with partial paths, etc. Explicit helpers keep
 * the styling deterministic and the call sites self-documenting.
 *
 * Color rules (in priority order):
 *
 *   1. `NO_COLOR=anything` → never color.       (https://no-color.org)
 *   2. `FORCE_COLOR=...`   → always color.
 *   3. otherwise           → color iff stderr is a TTY.
 *
 * No dependency on picocolors / chalk / etc. — we need exactly six
 * SGR codes (reset, bold, dim, italic, underline, cyan, magenta) and
 * any of those libraries would carry more surface than that. Inlining
 * keeps the install surface flat and pins log behavior to this file.
 *
 * Stderr only. Stdout is reserved for help text and any future
 * machine-readable output (where coloring would corrupt the payload).
 */

const TAG = "[react-git]";

// SGR codes we use:
//   0 = reset, 1 = bold, 2 = dim/faint, 3 = italic, 4 = underline,
//   35 = magenta, 36 = cyan
// `\x1b[Xm` is the ESC + CSI + parameter sequence every modern
// terminal interprets. `\x1b[0m` resets all attributes.
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";
const UNDERLINE = "\x1b[4m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

const useColor = (() => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stderr.isTTY);
})();

/** @param {string} codes  concat'd SGR codes (e.g. `${BOLD}${CYAN}`) */
const wrap = useColor ? (codes, s) => `${codes}${s}${RESET}` : (_codes, s) => s;

const tag = wrap(`${BOLD}${MAGENTA}`, TAG);

/**
 * Filesystem path or filename. Cyan italic — matches the convention
 * vite/react-server use for paths in their own logs, so a `<path>` in
 * our stream renders the same as one in theirs.
 *
 * @param {unknown} s
 */
export function path(s) {
  return wrap(`${CYAN}${ITALIC}`, String(s));
}

/**
 * URL. Cyan + underline so it stands out from a path; the underline is
 * the "this is a clickable link" affordance modern terminals (iTerm2,
 * Kitty, Wezterm, Alacritty with osc8) honor.
 *
 * @param {unknown} s
 */
export function url(s) {
  return wrap(`${CYAN}${UNDERLINE}`, String(s));
}

/**
 * Count or quantity. Bold — draws the eye to "what changed" without
 * tinting the value, which would make a row of progress lines feel
 * busy when most are running counters.
 *
 * @param {number | string} n
 */
export function num(n) {
  return wrap(BOLD, String(n));
}

/**
 * Identifier (ref name, branch, tag, named asset). Bold cyan so it
 * carries the same "this is a thing you can refer to elsewhere" weight
 * as a path, but without the italic that says "this is a literal file
 * on disk."
 *
 * @param {unknown} s
 */
export function name(s) {
  return wrap(`${BOLD}${CYAN}`, String(s));
}

/**
 * Git short SHA / abbreviated content hash. Dim — present for
 * traceability but not eye-catching; the surrounding ref name or count
 * is what the user is actually scanning for.
 *
 * @param {unknown} s
 */
export function sha(s) {
  return wrap(DIM, String(s));
}

/**
 * Duration in ms. Dim — same reasoning as `sha`: useful when
 * something looks slow, irrelevant otherwise.
 *
 * @param {number | string} ms  numeric ms, or a pre-formatted string
 *   like `"123ms"` if the caller wants to control units
 */
export function dur(ms) {
  const s = typeof ms === "number" ? `${ms}ms` : String(ms);
  return wrap(DIM, s);
}

/**
 * Keyword / mode marker (e.g. `live`, `manifest`, `skip`, `wipe`).
 * Bold magenta — same hue family as the `[react-git]` tag, so a status
 * verb still reads as "ours".
 *
 * @param {unknown} s
 */
export function kw(s) {
  return wrap(`${BOLD}${MAGENTA}`, String(s));
}

/**
 * Generic dim wrapper for low-priority context.
 *
 * @param {unknown} s
 */
export function dim(s) {
  return wrap(DIM, String(s));
}

/**
 * @param {string} message  one-line message; trailing newline added.
 *   Multi-line input is preserved verbatim — every line gets the same
 *   timestamp+tag prefix so wrapped messages stay attributable when
 *   they interleave with another tool's stream.
 */
export function log(message) {
  const prefix = `${dim(stamp())} ${tag} `;
  if (!message.includes("\n")) {
    process.stderr.write(`${prefix}${message}\n`);
    return;
  }
  const out = message
    .split("\n")
    .map((line) => (line === "" ? "" : `${prefix}${line}`))
    .join("\n");
  process.stderr.write(`${out}\n`);
}

function stamp() {
  return new Date().toLocaleTimeString("en-US");
}
