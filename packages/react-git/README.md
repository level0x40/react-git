<div align="center">

# `@level0x40/react-git`

**Static Git source artifact viewer.**
Render any local Git repository as a publishable React UI — no server, no database, no runtime access to the original repo.

[![npm version](https://img.shields.io/npm/v/@level0x40/react-git.svg?style=flat-square&color=8010e1)](https://www.npmjs.com/package/@level0x40/react-git)
[![License](https://img.shields.io/npm/l/@level0x40/react-git.svg?style=flat-square&color=8010e1)](./LICENSE)
[![Powered by react-server](https://img.shields.io/badge/powered%20by-%40lazarv%2Freact--server-6964ff?style=flat-square)](https://react-server.dev)
[![Docs](https://img.shields.io/badge/docs-react--git.level0x40.com-aaffff?style=flat-square)](https://react-git.level0x40.com)

</div>

---

```sh
npx @level0x40/react-git build /path/to/your/repo
```

The output is plain HTML, JSON, and assets under `./dist`. Drop it on Cloudflare Pages, Netlify, GitHub Pages, S3 + CloudFront, or any static host.

## What it does

Reads a local Git repository, extracts its source artifacts into a typed manifest, and renders them as a self-contained static site: commits, refs, trees, blobs, diffs, and a contribution heatmap. The build pipeline runs [`@lazarv/react-server`](https://react-server.dev)'s production server with a streaming export hook driving renders, then writes the result to disk.

## Quick start

Run from inside the repo you want to render:

```sh
# Build a static site for the current repo.
npx @level0x40/react-git build

# For iterative work, run the dev server with hot reload.
npx @level0x40/react-git dev
```

Both accept an optional repo path if you'd rather run them from elsewhere:

```sh
npx @level0x40/react-git build /path/to/your/repo
```

## Templates

Six visual styles ship in the box. Pick one with `--template <name>`, or stack multiple — file overrides and config merging both honour CLI order, so the last entry wins.

| Name           | Style                                      |
| -------------- | ------------------------------------------ |
| `default`      | Editorial monospace, terra-cotta accent.   |
| `primer`       | GitHub-faithful Primer aesthetic.          |
| `w3c`          | W3C technical-report styling, navy accent. |
| `react-server` | Companion to react-server.dev, gold ramp.  |
| `sketchpad`    | Hand-drawn coral-and-teal panel look.      |
| `tui`          | Terminal aesthetic, ANSI palette.          |

```sh
# Stack two templates: a built-in for the chrome, a local folder for overrides.
react-git build --template primer --template ./my-overlay
```

## Modes

Two extraction strategies, selected with `--live`:

- **manifest** _(default)_ — Pre-extract every commit, ref, tree, and blob into JSON shards. Fastest builds, deterministic, no git access at render time.
- **live** — Skip extraction; query Git directly for every render. Best for development against a moving repo, or one-off previews.

## Data layer

The Git data extraction is a separate concern from rendering. The same code that powers the static site is exposed as a standalone library through three subpath exports — usable from any Node host, with no `@lazarv/react-server` runtime needed.

| Subpath                             | Purpose                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `@level0x40/react-git/source`       | Stable function surface — `getProject`, `listCommits`, `getDiff`, `getBlob`, … |
| `@level0x40/react-git/source/build` | Same content under its build-time alias.                                       |
| `@level0x40/react-git/source/types` | JSDoc typedefs (`SourceCommit`, `SourceTree`, `SourceDiff`, …).                |

```js
import { listCommits, getDiff } from "@level0x40/react-git/source";

const commits = await listCommits();
const diff = await getDiff(commits[0].sha);
```

The public functions carry `"use cache"` directives that the `@lazarv/react-server` runtime interprets for per-request deduplication. Outside that runtime the directives are inert string statements — calls work in any Node host and just don't dedupe automatically. Wrap with your own cache for hot paths.

## Forwarding flags to `@lazarv/react-server`

Any flag that `react-git` doesn't own is forwarded verbatim to the underlying runtime, including the optional value forms cac uses:

```sh
react-git build --deploy                  # → react-server build --deploy
react-git build --silent --adapter cloudflare
react-git dev   --cors --devtools --inspect
```

`--force` and `--mode` collide between react-git and react-server: `--force` keeps its react-git meaning (cache wipe) and is not forwarded; `--mode` is forwarded (production/development) — flip to live extraction with `--live` instead.

## Documentation

Full docs: **[react-git.level0x40.com](https://react-git.level0x40.com)**.

## Contributing

Contributions, issues, and feature requests are welcome. See [CONTRIBUTING.md](../../CONTRIBUTING.md) and the [Code of Conduct](../../CODE_OF_CONDUCT.md). Open an issue at [github.com/level0x40/react-git/issues](https://github.com/level0x40/react-git/issues).

## License

[MIT](./LICENSE) © [Level 0x40 Labs](https://level0x40.com).

---

<div align="center">

<a href="https://level0x40.com">
  <img src="https://level0x40.com/lvl-logo.svg" alt="Level 0x40 Labs" width="120" />
</a>

**A [Level 0x40 Labs](https://level0x40.com) project.**
For developers, artists and gamers.

[Website](https://level0x40.com) · [GitHub](https://github.com/level0x40) · [X](https://x.com/level0x40)

</div>
