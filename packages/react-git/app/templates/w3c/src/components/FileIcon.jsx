/**
 * w3c FileIcon — render nothing.
 *
 * W3C documents and TR specifications are text-first: file lists are
 * rendered as anchor text alone, never as iconified entries. Adding
 * 16×16 colored chips to the file table would introduce decoration
 * the rest of this template deliberately avoids.
 *
 * Returning `null` keeps the file column purely textual — the
 * surrounding label, link text, or filename already carries the
 * meaning, exactly as a `<dt>`/`<dd>` listing in a W3C spec would.
 *
 * If a downstream consumer happens to import a NAMED export from
 * the FileIcon module (`fileKindFor` is the only one in the default
 * impl), the skeleton's `export *` from this file forwards nothing
 * and the consumer would see an undefined named export. No internal
 * consumers do that — `fileKindFor` stays intra-module in the
 * default impl — so this stub is safe.
 *
 * @returns {null}
 */
export default function FileIcon() {
  return null;
}
