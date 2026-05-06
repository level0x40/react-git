<div align="center">

# `@level0x40/react-git`

**A [Level 0x40 Labs](https://level0x40.com) project.**

A CLI that turns any local Git repository into a static, publishable React UI for browsing source artifacts — commits, refs, trees, blobs, diffs, and contribution heatmaps. Powered by [`@lazarv/react-server`](https://react-server.dev).

[![npm version](https://img.shields.io/npm/v/@level0x40/react-git.svg?style=flat-square&color=8010e1)](https://www.npmjs.com/package/@level0x40/react-git)
[![License](https://img.shields.io/npm/l/@level0x40/react-git.svg?style=flat-square&color=8010e1)](./LICENSE)
[![Powered by react-server](https://img.shields.io/badge/powered%20by-%40lazarv%2Freact--server-6964ff?style=flat-square)](https://react-server.dev)
[![Docs](https://img.shields.io/badge/docs-react--git.level0x40.com-aaffff?style=flat-square)](https://react-git.level0x40.com)

</div>

---

```sh
npx @level0x40/react-git build /path/to/your/repo
```

The output is plain HTML, JSON, and assets — drop it on Cloudflare Pages, Netlify, GitHub Pages, S3 + CloudFront, or any static host.

See the published docs at [react-git.level0x40.com](https://react-git.level0x40.com) and the npm package at [`@level0x40/react-git`](https://www.npmjs.com/package/@level0x40/react-git).

## Repository layout

This is a pnpm workspace. Two members live under it.

```
.
├── packages/
│   └── react-git/          # @level0x40/react-git — the published CLI + runtime
└── docs/                   # @level0x40/react-git-docs — the documentation site
```

The CLI is what gets published to npm. The docs site is private — it builds with `@lazarv/react-server` and deploys to Cloudflare Pages.

## Prerequisites

- Node.js ≥ 22 (the `.nvmrc` pins the version this repo develops against)
- pnpm 10.33+ (use `corepack enable` to get the version pinned in `package.json`)
- Git ≥ 2.40

## Develop

```sh
pnpm install                     # link the workspace
pnpm react-git dev /path/to/repo # run the CLI in dev mode against a repo
pnpm docs dev                    # run the docs site locally on :3000
```

Both `pnpm react-git` and `pnpm docs` are workspace-filter passthroughs — they run against `@level0x40/react-git` and `@level0x40/react-git-docs` respectively, so any extra arguments forward to the package's own scripts.

## Release

Releases are managed with [Changesets](https://github.com/changesets/changesets). The flow is:

1. **Author your change.** Make code changes on a branch, open a pull request.
2. **Add a changeset.** Run `pnpm changeset` and follow the prompts to describe what changed and pick a semver bump (patch/minor/major). The command writes a markdown file under `.changeset/`. Commit it with your PR.
3. **Merge the PR.** When the PR lands on `main`, the **Release** GitHub Action opens (or updates) a "Version Packages" PR with the bumped versions and updated `CHANGELOG.md`.
4. **Merge the Version Packages PR.** That triggers the same workflow to publish the bumped packages to npm.

For the release workflow to publish, set an `NPM_TOKEN` repository secret with publish permissions for the `@level0x40` scope. The `GITHUB_TOKEN` provided by Actions is sufficient for the PR creation step.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide. The short version: fork, branch, run `pnpm changeset` to record your change, open a PR.

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.

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
