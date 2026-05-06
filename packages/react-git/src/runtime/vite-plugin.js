/**
 * @file Vite plugin that exposes the source-graph to react-server's
 * build/dev pipelines. Propagates two pieces of build-time state
 * into the worker graph via env:
 *
 *   - `REACT_GIT_SOURCE_ROOT` — manifest root, used by manifest mode
 *     to locate `<workdir>/.react-git/cache/`.
 *   - `REACT_GIT_REPO` — absolute path to the live git repo, used by
 *     live mode to read directly from git via `GitAdapter`.
 *   - `REACT_GIT_MODE` — "manifest" (default) or "live".
 *
 * The data layer (`runtime/source-build.js`) reads whichever env vars
 * are relevant for the active mode. Mode selection happens at the
 * CLI layer (`build`/`dev` `--live` flag) and gets baked into the
 * synthesized `react-server.config.mjs` plugin options.
 */

/**
 * @typedef {object} ReactGitPluginOptions
 * @property {string} [workdir]
 *   Absolute path to the working dir whose `.react-git/cache/` holds
 *   the manifest. Required for manifest mode; ignored in live mode.
 * @property {string} [repo]
 *   Absolute path to the git repo. Required for live mode.
 * @property {"manifest" | "live"} [mode]
 *   Defaults to "manifest" if `workdir` is set, else "live".
 */

/**
 * Options are optional — the plugin's main job is registering the
 * runtime with react-server's plugin chain. When `mode`/`workdir`/
 * `repo` are passed they're forwarded into env at `configResolved`
 * time (legacy path used by the file-staging flow). When omitted,
 * the CLI is responsible for setting those env vars itself before
 * `reactServer()` / `build()` runs — that's the no-stage path,
 * where the plugin call is just `reactGitPlugin()`.
 *
 * @param {ReactGitPluginOptions} [options]
 */
export function reactGitPlugin(options = {}) {
  const explicitMode = options.mode ?? (options.workdir ? "manifest" : undefined);
  return {
    name: "@level0x40/react-git",
    configResolved() {
      // Only write env vars when options were supplied — leaving the
      // env untouched lets the CLI's pre-set values stand, which
      // matters when the plugin is invoked from an injected
      // initialConfig where the CLI has already set `REACT_GIT_*`.
      if (explicitMode) process.env.REACT_GIT_MODE = explicitMode;
      if (options.workdir) {
        process.env.REACT_GIT_SOURCE_ROOT = options.workdir;
      }
      if (options.repo) {
        process.env.REACT_GIT_REPO = options.repo;
      }
    },
    /** @param {unknown} server */
    configureServer(server) {
      // Stash for HMR work — dev.js watches `.git/` and calls into
      // the runtime via env-only signaling for now. Touch arguments
      // so linters keep them.
      void server;
    },
  };
}
