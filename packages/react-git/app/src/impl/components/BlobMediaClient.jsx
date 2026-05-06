"use client";

/**
 * Client-side toggle for renderable blobs (markdown, images, audio,
 * video, SVG). The toggle picks between the *rendered* view and the
 * *raw* view; both are server-rendered as JSX trees and shipped in
 * the RSC payload — switching is a client-side conditional render
 * with no server round-trip.
 *
 * Mirror of the DiffViewClient pattern: a small context for the
 * current choice, a toggle UI component, and a body shell that
 * picks the right subtree to mount. Localstorage persists the
 * choice across navigations and reloads. URL is intentionally NOT
 * involved — these are per-blob view preferences, not addressable
 * states, and a Link-driven toggle would refetch the route's RSC
 * payload on every click for no benefit.
 *
 * Hydration note: the SSR pass renders with the default ("rendered")
 * because localStorage isn't available server-side. A `useEffect`
 * reads the stored choice on mount and re-renders if the user had
 * picked "raw" previously. That produces a one-frame flicker for
 * raw-preferring users; acceptable trade-off for not coupling the
 * preference to the URL or a cookie.
 */

import { createContext, useContext, useEffect, useState } from "react";

/** @typedef {"rendered" | "raw"} BlobView */

const STORAGE_KEY = "rg.blob.view";

const BlobViewContext = createContext(
  /** @type {{ view: BlobView, set: (v: BlobView) => void }} */ ({
    view: "rendered",
    set: () => {},
  }),
);

/** @param {{ children: React.ReactNode }} props */
export function BlobMediaProvider({ children }) {
  const [view, setView] = useState(/** @type {BlobView} */ ("rendered"));

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "raw" || stored === "rendered") setView(stored);
    } catch {
      // localStorage may be disabled (privacy mode, sandbox iframes).
      // Default "rendered" is fine.
    }
  }, []);

  const set = (/** @type {BlobView} */ next) => {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Same as above — non-fatal.
    }
  };

  return <BlobViewContext.Provider value={{ view, set }}>{children}</BlobViewContext.Provider>;
}

/**
 * Two-pill toggle, lives in the blob header next to the metadata
 * chips. Active button is marked with `aria-pressed="true"` +
 * `.is-active`, both consumed by the same CSS rule that styles the
 * inline-vs-split diff toggle — keeps visual language consistent.
 */
export function BlobViewToggle() {
  const { view, set } = useContext(BlobViewContext);
  return (
    <div className="rg-blob-view-toggle" role="tablist" aria-label="Blob view">
      <button
        type="button"
        role="tab"
        aria-pressed={view === "rendered"}
        aria-selected={view === "rendered"}
        className={`rg-blob-view-btn ${view === "rendered" ? "is-active" : ""}`}
        onClick={() => set("rendered")}
      >
        Rendered
      </button>
      <button
        type="button"
        role="tab"
        aria-pressed={view === "raw"}
        aria-selected={view === "raw"}
        className={`rg-blob-view-btn ${view === "raw" ? "is-active" : ""}`}
        onClick={() => set("raw")}
      >
        Raw
      </button>
    </div>
  );
}

/**
 * Render whichever of the two SSR-rendered subtrees the current
 * view selects. Both subtrees are evaluated server-side so the
 * client switch is just a conditional mount.
 *
 * @param {{ rendered: React.ReactNode, raw: React.ReactNode }} props
 */
export function BlobBodyShell({ rendered, raw }) {
  const { view } = useContext(BlobViewContext);
  return view === "raw" ? raw : rendered;
}
