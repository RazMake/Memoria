import { vscode } from './state';

/**
 * Intercepts clicks on `<a>` tags whose href starts with `./` or `../`
 * (relative file links) and sends an `openLink` message to the extension
 * host instead of letting the webview navigate (which CSP blocks anyway).
 */
export function interceptLocalLinks(container: HTMLElement): void {
    for (const anchor of Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
        const href = anchor.getAttribute('href');
        if (!href) continue;
        if (isRelativeFileLink(href)) {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                vscode.postMessage({ type: 'openLink', href });
            });
        }
    }
}

function isRelativeFileLink(href: string): boolean {
    // Match paths starting with ./ or ../ or bare filenames (no protocol)
    if (/^https?:\/\//i.test(href)) return false;
    if (/^mailto:/i.test(href)) return false;
    if (href.startsWith('#')) return false;
    return true;
}
