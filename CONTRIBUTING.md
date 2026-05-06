# Contributing to `@level0x40/react-git`

Thanks for your interest. This guide covers what you need to land a change and what we look for in reviews.

## Before you start

For anything beyond a typo or a one-line bug fix, open an [issue](https://github.com/level0x40/react-git/issues) first. A short discussion up front saves a lot of back-and-forth on the PR. For trivial fixes, a PR is fine.

If you're picking up an existing issue, leave a comment so we know it's being worked on.

## Local setup

This is a pnpm workspace.

```sh
pnpm install
pnpm react-git dev /path/to/repo   # exercise the CLI against a real repo
pnpm docs dev                      # exercise the docs site
```

Use Node ≥ 22 (the `.nvmrc` is the version we develop against). For pnpm, `corepack enable` picks up the version pinned in `package.json`.

## Branching

Branch off `main` and name the branch after the change, not the issue number. `feature/calendar-tooltip-locale` reads better six months later than `feature/issue-42`.

## Making a change

The workspace contains two members:

- `packages/react-git/` — the published CLI + runtime. This is what users install.
- `docs/` — the documentation site. Private; deployed but not published.

Most changes go in `packages/react-git/src/`. The `app/` directory inside it ships with the package and contains the runtime's React tree (pages, components, layout, the six built-in templates).

The data layer is intentionally usable as a standalone library: anything you add to `packages/react-git/src/runtime/source-build.js` becomes part of the `@level0x40/react-git/source` public surface. Treat it accordingly — adding or changing a function there is a public API change.

## Recording a changeset

Every PR that affects the published package needs a changeset. Run:

```sh
pnpm changeset
```

Pick the affected package (`@level0x40/react-git`), choose the semver bump, and write a one-paragraph summary aimed at people reading release notes — not at people reading commit messages. Commit the generated `.changeset/*.md` file as part of your PR.

Skip the changeset if the change is internal-only (e.g. CI tweaks, repository documentation, dev tooling). For docs-site-only changes, no changeset is needed since the docs package is private.

## Lint, format, verify

CI runs two checks on every PR. Run them locally before pushing:

```sh
pnpm lint            # oxlint — catches dead imports, suspect JSX, etc.
pnpm format:check    # oxfmt — fails if any file would be reformatted
pnpm format          # auto-apply formatting
```

There's no automated test suite. Most of the surface here is hard to test cheaply — exercising the CLI means running it against a real Git repo, exercising the templates means rendering them, and the cost of a heavy harness for either outweighs what it would catch. Verify manually instead:

- For CLI/build changes: run `pnpm react-git build /path/to/some-repo` against at least one real Git repo and inspect the output.
- For runtime/template changes: `pnpm react-git dev` and click through the affected pages.
- For data-layer changes: import the relevant `@level0x40/react-git/source` function in a small Node script and exercise it.

## Code style

Match the surrounding style. The codebase is plain ESM JavaScript with JSDoc — no TypeScript compile step, no bundler, the CLI is meant to be readable as source.

A few conventions worth knowing:

- Comments explain _why_, not _what_. If a block is long, explain the constraint or trade-off it's working around.
- Public functions in `runtime/source-build.js` carry `"use cache; profile=react-git-data"` directives. Keep them; they're inert outside `@lazarv/react-server` but enable per-request deduplication when running under it.
- `--force` and `--mode` flags have specific meanings inside react-git that don't match `@lazarv/react-server`'s — see the help output for details.

## Pull requests

Keep PRs focused. One change per PR makes review faster and bisecting easier. The PR description should explain the _why_ of the change; the diff covers the _what_. Avoid bullet-listed change logs in the description — that's what the changeset is for.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
