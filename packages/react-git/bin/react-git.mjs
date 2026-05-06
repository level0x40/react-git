#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2)).catch((err) => {
  // CliError = expected user-facing failure. Print just the message
  // so the actionable bit isn't buried under a Node stack trace, and
  // honor the carried exit code (2 for usage, 1 for runtime).
  if (err && err.name === "CliError") {
    process.stderr.write(`react-git: ${err.message}\n`);
    process.exit(typeof err.exitCode === "number" ? err.exitCode : 1);
  }

  // node:util parseArgs failures (unknown option, missing value, etc.)
  // come through as plain Errors with `code: "ERR_PARSE_ARGS_*"`. Treat
  // them as usage errors — point at --help rather than dumping a stack.
  if (err && typeof err.code === "string" && err.code.startsWith("ERR_PARSE_ARGS_")) {
    process.stderr.write(`react-git: ${err.message}\n`);
    process.stderr.write(`Run 'react-git --help' for usage.\n`);
    process.exit(2);
  }

  // Anything else is a bug or genuine surprise. Full stack helps us
  // diagnose; this is exactly the case where hiding the trace would
  // make life harder.
  console.error(err);
  process.exit(1);
});
