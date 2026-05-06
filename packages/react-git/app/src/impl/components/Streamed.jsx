import { Suspense } from "react";

/**
 * Chunk-and-stream renderer for large lists.
 *
 * Breaks `items` into groups of `chunkSize` and wraps each group in
 * `<Suspense>`. React 19's `renderToReadableStream` (used by both
 * runtime SSR and the static-export pipeline) flushes at Suspense
 * boundaries, so this:
 *
 *   1. Silences React's ">512 kB without Suspense boundaries" warning
 *      on repos with thousands of refs / commits.
 *   2. Lets the document head + everything above the list paint while
 *      the rows are still rendering, instead of holding the whole
 *      page back until the entire list resolves.
 *
 * The component is layout-transparent: each `<Suspense>` renders only
 * a fragment of children into the parent, so this works as a drop-in
 * inside `<tbody>`, `<ol>`, or any other list container.
 *
 * Default `chunkSize` of 500 keeps each chunk's rendered HTML well
 * under the 512 kB threshold for typical row sizes (refs ~250 B,
 * commits ~500 B). Tune downward if rows are unusually heavy.
 *
 * @template T
 * @param {{
 *   items: readonly T[],
 *   children: (item: T, index: number) => React.ReactNode,
 *   chunkSize?: number,
 * }} props
 */
export default function Streamed({ items, children, chunkSize = 500 }) {
  if (items.length <= chunkSize) {
    // Fast path: small list, no chunking overhead, no extra DOM
    // wrappers. The single `<Suspense>` still acts as a flush
    // boundary if anything below ever turns async.
    return <Suspense>{items.map((item, i) => children(item, i))}</Suspense>;
  }
  /** @type {React.ReactNode[]} */
  const chunks = [];
  for (let start = 0; start < items.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, items.length);
    const slice = items.slice(start, end);
    chunks.push(
      <Suspense key={start}>{slice.map((item, i) => children(item, start + i))}</Suspense>,
    );
  }
  return chunks;
}
