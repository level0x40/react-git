/**
 * @file CLI error taxonomy. Two intentional categories:
 *
 *   - `CliError`: user-facing problem with an actionable message (bad
 *     flag, missing path, conflicting options). The bin script prints
 *     the message without a stack trace and exits with the carried
 *     exit code.
 *
 *   - Anything else: programmer error or genuinely unexpected failure.
 *     The bin script prints a full stack so we can debug it.
 *
 * The split exists because dumping a Node stack at someone who typed a
 * wrong flag is hostile — the stack is line noise that hides the
 * actionable bit. But hiding the stack on a real bug ("Cannot read
 * properties of undefined") makes triage harder. Throwing the right
 * class is how we get both.
 */

/**
 * Throw this for any failure that's the user's input or environment,
 * not a bug. Examples: missing repo path, target dir not empty,
 * conflicting flags. Carries an exit code so different shapes can map
 * to different statuses (2 = usage error, 1 = runtime failure).
 */
export class CliError extends Error {
  /**
   * @param {string} message
   * @param {{ exitCode?: number }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = "CliError";
    this.exitCode = opts.exitCode ?? 1;
  }
}
