// Stylesheet routes through the template plugin: with `--template
// <name>` active, this resolves to that template's
// `src/styles/main.css`; otherwise to the minimal base at
// `app/src/impl/styles/main.css`. See `runtime/template-plugin.js`
// for the resolution rules. CLI defaults to `--template default`,
// so in practice the resolved file is the default theme's full
// stylesheet.
import "virtual:rg/style/main";
import { getProject } from "@level0x40/react-git/source";
import { ScrollRestoration } from "@lazarv/react-server/navigation";
import CommitLink from "virtual:rg/component/CommitLink";
import FileIcon from "virtual:rg/component/FileIcon";

export default async function RootLayout({ children }) {
  // The layout queries project once for the brand + status chrome.
  // Per-page content does its own (cached) lookups for what it needs.
  const project = await getProject();
  const headShort = project.headSha.slice(0, 8);
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="generator" content="@level0x40/react-git" />
        <meta name="color-scheme" content="dark light" />
      </head>
      <body>
        {/* Ambient background: animated grid + scanlines + ambient
            radial glow. Pure CSS, fixed full-bleed, pointer-events
            disabled — pure decoration. */}
        <div className="rg-ambient" aria-hidden="true">
          <div className="rg-ambient-grid" />
          <div className="rg-ambient-scan" />
          <div className="rg-ambient-glow" />
        </div>

        <div className="rg-app">
          {/* Top HUD: brand monogram + nav row + status block. */}
          <header className="rg-hud">
            <a href="/" className="rg-hud-brand">
              <span className="rg-hud-brand-mark" aria-hidden="true" />
              <span className="rg-hud-brand-name">{project.name}</span>
            </a>
            {/* SHA chip is a separate link out of the brand cluster
                so clicking it goes to the commit detail rather than
                back to home. Tab order goes brand → sha → nav. */}
            <CommitLink
              sha={project.headSha}
              className="rg-hud-brand-sha"
              title={`Inspect commit ${headShort}`}
            >
              {headShort}
            </CommitLink>
            <nav className="rg-hud-nav" aria-label="Sections">
              <a href="/files" data-key="01">
                <FileIcon kind="files" />
                <span>files</span>
              </a>
              <a href="/log" data-key="02">
                <FileIcon kind="log" />
                <span>log</span>
              </a>
              <a href="/refs" data-key="03">
                <FileIcon kind="refs" />
                <span>refs</span>
              </a>
              <a href="/tags" data-key="04">
                <FileIcon kind="tags" />
                <span>tags</span>
              </a>
            </nav>
            <div className="rg-hud-status" aria-hidden="true">
              <span className="rg-hud-status-mode">STATIC</span>
              <span className="rg-hud-status-sep">::</span>
              <span className="rg-hud-status-dot" />
              <span className="rg-hud-status-label">READY</span>
            </div>
          </header>

          {/* Content wells in here; per-page <main> sits inside. */}
          <div className="rg-stage">{children}</div>
        </div>

        {/* Fixed bottom status bar — HUD element. Translucent +
            backdrop-blur over the page, gives a continuous "system
            chrome" presence without hijacking content space. */}
        <footer className="rg-statusbar" aria-hidden="true">
          <span className="rg-statusbar-cell">
            <span className="rg-statusbar-key">SYS</span>
            react-git
          </span>
          <span className="rg-statusbar-cell">
            <span className="rg-statusbar-key">REV</span>
            <code>{headShort}</code>
          </span>
          <span className="rg-statusbar-cell rg-statusbar-cell-grow">
            <span className="rg-statusbar-key">REPO</span>
            {project.name}
          </span>
          <span className="rg-statusbar-cell rg-statusbar-cell-end">
            <span className="rg-statusbar-pulse" />
            ONLINE
            <span className="rg-statusbar-cursor" />
          </span>
        </footer>

        {/* Mounted once at the layout level: handles scroll save/
            restore on navigation, including query-only changes
            (which is exactly how the inline ↔ split diff toggle
            works — see DiffViewClient.jsx). */}
        <ScrollRestoration />
      </body>
    </html>
  );
}
