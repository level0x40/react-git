/**
 * Docs site config — one-page site, static-only Cloudflare deployment.
 *
 * `serverlessFunctions: false` opts out of worker generation; the build
 * emits pure static assets (HTML + CSS + JS) plus a `_routes.json` for
 * Pages compatibility. No worker entry, no `_headers` quirks, no
 * runtime endpoints — the entire site is prerendered.
 *
 * MDX support is built into the file-router (`@mdx-js/rollup` ships
 * with `@lazarv/react-server`), but the default remark stack is just
 * `remark-frontmatter` + `remark-mdx-frontmatter`. GFM extensions —
 * pipe-table syntax, strikethrough, autolinks, task lists — require
 * `remark-gfm`, which we add explicitly below.
 */

import { defineConfig } from "@lazarv/react-server/config";
import remarkGfm from "remark-gfm";

// Static prerendering is opted in per page via the sibling
// `<page>.static.{js,mjs,ts,mts,json}` marker — see
// `src/pages/page.static.json` (`true` for parameterless routes).
// No config-level `export` hook is needed; that hook only transforms
// paths the file-router has already collected as static, it doesn't
// itself opt pages in.
export default defineConfig({
  root: "src/pages",
  adapter: ["cloudflare", { serverlessFunctions: false }],

  mdx: {
    remarkPlugins: [remarkGfm],
  },
});
