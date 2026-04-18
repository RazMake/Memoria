export function el(tag: string, className?: string): HTMLElement {
    const e = document.createElement(tag);
    if (className) e.className = className;
    return e;
}

export function formatDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

export function formatDateLong(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Strips `<script>` tags and event-handler attributes from pre-rendered HTML.
 * The extension host already produces the HTML via markdown-it, but defence-in-depth
 * is cheap so we sanitize anyway.
 */
export function sanitizeHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    for (const script of Array.from(div.querySelectorAll('script'))) {
        script.remove();
    }
    for (const node of Array.from(div.querySelectorAll('*'))) {
        for (const attr of Array.from(node.attributes)) {
            if (attr.name.startsWith('on')) {
                node.removeAttribute(attr.name);
            }
        }
        if (node.tagName === 'A') {
            const href = node.getAttribute('href');
            if (href && /^\s*javascript:/i.test(href)) {
                node.removeAttribute('href');
            }
        }
    }
    return div.innerHTML;
}
