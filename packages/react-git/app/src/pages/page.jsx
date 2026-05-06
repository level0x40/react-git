/**
 * Skeleton: this file is what the file-router scans to discover the
 * route. The actual implementation lives at
 * `<package>/app/src/impl/pages/page.jsx` (or, when the user passes
 * `--template <dir>`, at `<template>/src/pages/page.jsx`). Resolution
 * happens in `src/runtime/template-plugin.js` — user file wins, built-in
 * impl is the fallback.
 *
 * Why the indirection: an alias-based overlay couldn't support a user
 * file that *wraps* the original (the common case — "render the
 * built-in page, plus a banner") because the wrap-around import would
 * land on the user file again, looping. The skeleton/impl split makes
 * the wrap path go through `@level0x40/react-git/impl/pages/page`,
 * which the package exports map directly to the impl with no plugin
 * involvement, so no cycle.
 *
 * Edit `app/src/impl/pages/page.jsx`, not this file.
 */
export { default } from "virtual:rg/page/page";
export * from "virtual:rg/page/page";
