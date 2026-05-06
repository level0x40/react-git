# `@level0x40/react-git` docs

One-page docs site for `@level0x40/react-git`. Built with
[@lazarv/react-server](https://react-server.dev), deployed to
Cloudflare Pages as static assets.

## Develop

```sh
pnpm install
pnpm dev
```

The file-system router scans `src/pages/` and serves the single
`page.mdx` at `/`.

## Build

```sh
pnpm build
```

The Cloudflare adapter is configured with `serverlessFunctions: false`,
so the build emits a static asset bundle (HTML, CSS, JS, manifest)
under `dist/`. There is no worker — the entire site is prerendered at
build time.

## Deploy

```sh
pnpm deploy            # alias for: react-server build --deploy
```

The `--deploy` flag is built into the `react-server` CLI: it runs the
build and the Cloudflare deployment in one step, no separate
`wrangler deploy` invocation needed.
