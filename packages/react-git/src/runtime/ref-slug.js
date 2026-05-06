/**
 * @file URL-safe ref encoding. Branch and tag short-names can contain
 * slashes (`feature/foo`, `release/v2`); a single URL segment cannot.
 * We map `/` ↔ `__` so refs survive a round trip through both routing
 * (where each `[refSlug]` segment is a single path component) and back to
 * git-readable names inside page components.
 *
 * Reversibility holds as long as ref names don't already contain `__`.
 * That's true for ~all real-world refs; we'll revisit only if a real
 * project trips it.
 */

/** @param {string} ref  git ref short-name */
export function refToSlug(ref) {
  return ref.replaceAll("/", "__");
}

/** @param {string} slug  URL segment value */
export function slugToRef(slug) {
  return slug.replaceAll("__", "/");
}
