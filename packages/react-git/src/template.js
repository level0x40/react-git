/**
 * @file Template-overlay support — config layer.
 *
 * The previous version of this module did two things:
 *   1. Walk the template directory and emit Vite `resolve.alias`
 *      entries for every file the user dropped in.
 *   2. Read the user's `react-server.config.{mjs,js,ts}` and deep-
 *      merge it with a base config.
 *
 * Step (1) is gone — file overrides now flow through the
 * skeleton/impl indirection in `runtime/template-plugin.js`. The
 * alias approach broke when a user file wanted to wrap the
 * original (alias caught the wrap import and looped back to the
 * user's own file). The plugin-based scheme has no such cycle.
 *
 * What remains here is the config-layer overlay: read the user's
 * `react-server.config.*` if present, deep-merge it on top of the
 * shipped base config. The shipped config file
 * (`app/react-server.config.mjs`) calls `loadUserConfig` +
 * `mergeConfigs` directly.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Filenames at the template root that are loaded as the user's
 * react-server config. Order = preference; first match wins.
 *
 * Vite's config-loading pipeline strips TypeScript transparently
 * when the config is loaded through Vite, but `loadUserConfig` runs
 * at a layer above Vite (during config module evaluation in
 * `app/react-server.config.mjs`), so a `.ts` user config would need
 * a Node loader hook the user supplies. `.mjs`/`.js` are the
 * supported defaults; `.ts` works if the user has set up a loader
 * (e.g., `tsx`, `ts-node`).
 */
const CONFIG_FILES = [
  "react-server.config.mjs",
  "react-server.config.js",
  "react-server.config.ts",
];

/**
 * Load and return the user's config module if any `CONFIG_FILES`
 * entry is present at the template root. Returns null otherwise.
 *
 * @param {string} templateDir
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function loadUserConfig(templateDir) {
  const absTemplate = path.resolve(templateDir);
  const stat = await fs.stat(absTemplate).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`[react-git] --template directory does not exist: ${absTemplate}`);
  }

  for (const candidate of CONFIG_FILES) {
    const p = path.join(absTemplate, candidate);
    if (!(await pathExists(p))) continue;
    const url = pathToFileURL(p).href;
    const mod = await import(url);
    return /** @type {Record<string, unknown>} */ (mod.default ?? mod);
  }
  return null;
}

/**
 * Deep-merge two plain objects. Arrays are concatenated (a + b) so
 * Vite plugin lists, react-server `handlers`, and similar additive
 * config slots compose cleanly. Scalars and nullish values from `b`
 * win. Functions, classes, and other non-plain objects are replaced
 * wholesale by `b`'s value when both sides have one.
 *
 * Used to layer the user's `react-server.config` on top of the
 * shipped base config in `app/react-server.config.mjs`.
 *
 * @template {Record<string, any> | undefined | null} A
 * @template {Record<string, any> | undefined | null} B
 * @param {A} base
 * @param {B} overlay
 * @returns {A extends null | undefined ? B : B extends null | undefined ? A : A & B}
 */
export function mergeConfigs(base, overlay) {
  if (base === null || base === undefined) return /** @type {any} */ (overlay);
  if (overlay === null || overlay === undefined) return /** @type {any} */ (base);
  return /** @type {any} */ (deepMerge(base, overlay));
}

/**
 * @param {any} a
 * @param {any} b
 */
function deepMerge(a, b) {
  if (a === null || a === undefined) return b;
  if (b === null || b === undefined) return a;
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (!isPlainObject(a) || !isPlainObject(b)) return b;
  const out = { ...a };
  for (const k of Object.keys(b)) {
    out[k] = deepMerge(a[k], b[k]);
  }
  return out;
}

/** @param {unknown} v */
function isPlainObject(v) {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** @param {string} p */
async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
