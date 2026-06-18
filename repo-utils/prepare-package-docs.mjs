// Generates the docs that ship inside the packaged .vsix.
//
// WHY: `vsce package` runs from `src/` (where the extension manifest lives), so it only
// picks up a `README.md` / `CHANGELOG.md` located next to `src/package.json`. The canonical
// docs live at the repository root, so without this step the published extension has an
// EMPTY Details page on the Marketplace and in the VS Code Extensions view.
//
// The root README uses repo-relative links such as `src/resources/docs/...` that resolve on
// GitHub but NOT inside a `src/`-rooted package. We rewrite those `src/`-relative links to
// absolute GitHub URLs (raw for images, blob for everything else) so they render correctly
// both on the Marketplace and in the local Details tab.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const srcDir = resolve(repoRoot, "src");

/** Derives the canonical GitHub URL (without trailing `.git`) from the extension manifest. */
function getRepositoryUrl() {
    const manifest = JSON.parse(readFileSync(resolve(srcDir, "package.json"), "utf8"));
    const url = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
    if (!url) {
        throw new Error("prepare-package-docs: no `repository` field found in src/package.json.");
    }
    return url.replace(/\.git$/, "").replace(/\/$/, "");
}

/** Rewrites `](src/...)` markdown targets to absolute GitHub URLs so packaged docs resolve. */
function rewriteSrcRelativeLinks(markdown, repoUrl) {
    return markdown
        // Images first: ![alt](src/...) -> raw URL (image bytes).
        .replace(/(!\[[^\]]*\]\()src\//g, `$1${repoUrl}/raw/HEAD/src/`)
        // Remaining links: [text](src/...) -> blob URL (rendered page).
        .replace(/(\]\()src\//g, `$1${repoUrl}/blob/HEAD/src/`);
}

function copyDoc(name, transform) {
    const source = resolve(repoRoot, name);
    if (!existsSync(source)) {
        throw new Error(`prepare-package-docs: expected ${name} at the repository root.`);
    }
    const content = readFileSync(source, "utf8");
    const output = transform ? transform(content) : content;
    writeFileSync(resolve(srcDir, name), output, "utf8");
    console.log(`prepare-package-docs: generated src/${name}`);
}

const repositoryUrl = getRepositoryUrl();
copyDoc("README.md", (content) => rewriteSrcRelativeLinks(content, repositoryUrl));
copyDoc("CHANGELOG.md");
