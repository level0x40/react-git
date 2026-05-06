"use client";

/**
 * @file Client-side scaffolding for the inline ↔ split diff toggle.
 *
 * Architecture: URL is the source of truth (`?view=split`), but we
 * never navigate through the router. Instead the toggle calls
 * `history.replaceState` directly. react-server monkey-patches
 * `history.pushState`/`replaceState` to dispatch custom
 * "pushstate"/"replacestate" events; both `<ScrollRestoration>` and
 * `useSearchParams` subscribe to those events. So:
 *
 *   - Toggle click → history.replaceState → "replacestate" event
 *   - useSearchParams reactively re-renders DiffBodyShell with the
 *     new view (subtree swaps from the RSC payload, no fetch)
 *   - ScrollRestoration sees a query-only navigation and preserves
 *     scroll position automatically (no manual save/restore needed)
 *
 * Critical: this uses raw `history.replaceState`, NOT react-server's
 * `<Link>` or `useClient().navigate`. Those go through the router and
 * fetch the route's RSC payload — wasted work for a fully static
 * deployment where the same payload is already in memory and
 * identical for both views. The patched-history-API path skips the
 * router entirely while still firing the events that drive
 * ScrollRestoration and useSearchParams.
 *
 * localStorage persistence: written on every toggle click so the
 * user's preference survives across pages. On mount, if the URL has
 * no `view` param and localStorage holds "split", we replaceState to
 * `?view=split` so the preference applies. Hydration-safe because the
 * SSR-rendered HTML always defaults to inline (no search params at
 * SSG time); the post-mount replaceState happens after React has
 * hydrated, triggers a re-render via useSearchParams, swaps to split.
 */

import { useEffect } from "react";
import { useSearchParams } from "@lazarv/react-server/navigation";

const STORAGE_KEY = "rg-diff-view";

/** @typedef {"inline" | "split"} DiffView */

/**
 * Read the current view from the search-params object. The hook
 * returns a plain object (not URLSearchParams) — see location.mjs.
 *
 * @param {Record<string, unknown> | null | undefined} sp
 * @returns {DiffView}
 */
function viewFromSearchParams(sp) {
  return sp?.view === "split" ? "split" : "inline";
}

/**
 * Mutate the URL (and persist preference) without going through the
 * router. The patched history methods dispatch the events that
 * useSearchParams + ScrollRestoration subscribe to.
 *
 * @param {DiffView} target
 */
function applyView(target) {
  const url = new URL(window.location.href);
  if (target === "inline") {
    // Inline is the default — keep the URL clean rather than emit
    // `?view=inline`. Links shared after toggling back to inline
    // shouldn't carry the param.
    url.searchParams.delete("view");
  } else {
    url.searchParams.set("view", target);
  }
  // Preserve existing history.state so other modules (like the
  // router's outlet bookkeeping) don't get clobbered.
  history.replaceState(history.state, "", url.toString());

  try {
    window.localStorage.setItem(STORAGE_KEY, target);
  } catch {
    // localStorage can throw under privacy modes / sandboxed iframes.
  }
}

/**
 * Wraps the diff section. Sole job: on mount, if the URL has no
 * `view` param but localStorage remembers "split", apply it so the
 * persisted preference takes effect. No state, no context — URL is
 * the only state.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function DiffViewProvider({ children }) {
  useEffect(() => {
    // If the URL already specifies a view (deep-link, refresh after
    // toggle), leave it alone. localStorage is the FALLBACK source,
    // not an override.
    if (new URLSearchParams(window.location.search).has("view")) return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "split") applyView("split");
    } catch {
      // Ignore.
    }
  }, []);

  return children;
}

/**
 * Render the inline or split body based on URL. Both subtrees are
 * server-rendered and present in the RSC payload; only one is
 * mounted to DOM at a time.
 *
 * @param {{ inline: React.ReactNode, split: React.ReactNode }} props
 */
export function DiffBodyShell({ inline, split }) {
  const view = viewFromSearchParams(useSearchParams());
  return view === "split" ? split : inline;
}

export function DiffViewToggle() {
  const view = viewFromSearchParams(useSearchParams());
  return (
    <div className="rg-diff-toggle" role="group" aria-label="Diff view">
      <ToggleButton target="inline" current={view}>
        Inline
      </ToggleButton>
      <ToggleButton target="split" current={view}>
        Split
      </ToggleButton>
    </div>
  );
}

/**
 * @param {{ target: DiffView, current: DiffView, children: React.ReactNode }} props
 */
function ToggleButton({ target, current, children }) {
  const active = current === target;
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`rg-diff-toggle-btn ${active ? "is-active" : ""}`}
      onClick={() => {
        if (active) return;
        applyView(target);
      }}
    >
      {children}
    </button>
  );
}
