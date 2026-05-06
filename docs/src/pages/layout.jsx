/**
 * Document shell for the docs site. Server component — renders the
 * `<html>`/`<head>`/`<body>` structure once at build time.
 *
 * The chrome is intentionally minimal: a centered Level 0x40 logo
 * at the top (linking back to level0x40.com) and a small brand
 * attribution at the bottom. Just enough to signal that the docs
 * site is part of the Level 0x40 Labs family without dragging in
 * the parent site's full nav, mobile menu, or three-column footer.
 *
 * Stylesheet is imported here so Vite picks it up; the file router's
 * page-scan ignores `.css` files outside `pages/`, which is why
 * `styles.css` lives one level up.
 */

import "../styles.css";

export default function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Favicon stack (matches level0x40 family):
            - .ico: legacy fallback
            - .svg: modern browsers
            - apple-touch-icon: iOS home-screen */}
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" type="image/svg+xml" href="/lvl.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <title>@level0x40/react-git — static Git source viewer</title>
        <meta
          name="description"
          content="A CLI that turns any local Git repository into a static, publishable React UI for browsing source artifacts. Powered by @lazarv/react-server. A Level 0x40 Labs project."
        />

        <meta property="og:site_name" content="Level 0x40 Labs" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="@level0x40/react-git" />
        <meta
          property="og:description"
          content="Static Git source artifact viewer powered by @lazarv/react-server."
        />
        <meta property="og:image" content="https://level0x40.com/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@level0x40" />
        <meta name="twitter:image" content="https://level0x40.com/og-image.png" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Press+Start+2P&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <main>{children}</main>
        <footer className="brand-footer">
          <a
            href="https://level0x40.com"
            className="brand-logo brand-logo--small"
            aria-label="Level 0x40 Labs"
          >
            <img src="/lvl-logo.svg" alt="LVL 0x40" />
          </a>
          <p className="brand-attribution">
            A <a href="https://level0x40.com">Level 0x40 Labs</a> project ·{" "}
            <a href="https://github.com/level0x40/react-git">GitHub</a> · MIT licensed
          </p>
          <p className="brand-ready">READY.</p>
        </footer>
      </body>
    </html>
  );
}
