import { getHeadRef, getProject, getTree } from "@level0x40/react-git/source";
import FileBrowser from "virtual:rg/component/FileBrowser";

/**
 * `/files` — root directory listing for the default branch's HEAD.
 * Deep paths (`/files/src/index.js` etc.) live in `[...path].page.jsx`,
 * which handles both intermediate trees and leaf blobs.
 */
export default async function FilesIndexPage() {
  const [project, ref] = await Promise.all([getProject(), getHeadRef()]);
  const tree = await getTree(ref, "");
  return (
    <main className="rg-main">
      <header className="rg-crumbs">
        <a href="/">{project.name}</a>
        <span aria-hidden="true">/</span>
        <span>files</span>
      </header>
      <FileBrowser tree={tree} />
    </main>
  );
}
