# Generic Design Principles

## Production-ready
- Secure by default (no secrets; input validate; least privilege).
- Resilient I/O (timeouts; retry with backoff when it fits).
- Structured logging with scopes; useful context; no log spam.
- Use precise exceptions; don’t swallow; keep cause/context.
- When fixing one method, check siblings for the same issue.

## Performance
- Simple first; optimize hot paths when measured.
- Stream large payloads; avoid extra allocs.
- Use Span/Memory/pooling when it matters.
- Async end-to-end; no sync-over-async.

## Webview Performance (CRITICAL — never regress these patterns)
The todo editor and other webview-backed features must load fast and feel smooth. These patterns are mandatory:
- **Lazy initialization**: Defer expensive object construction (e.g., MarkdownIt) until first use.
- **Render caching**: Cache rendered HTML by content key; skip re-rendering unchanged items.
- **Fingerprint-based skip**: Compare document text against last-pushed text; skip no-op updates entirely.
- **Debounced propagation**: Coalesce rapid text changes (80ms) before pushing to webview.
- **External CSS**: Bundle CSS separately via esbuild; include skeleton placeholder in HTML shell for instant perceived load.
- **Incremental DOM**: Reconcile existing DOM nodes — remove stale, skip unchanged, rebuild only changed cards. Never `innerHTML` the entire list.
- **Optimistic UI**: Reflect user actions (checkbox, drag) immediately in the DOM before the extension round-trip completes.
- **Pre-resolve expensive lookups**: Cache workspace root, source maps, and tooltip HTML — avoid async lookups on every editor open or tab switch.
- **`retainContextWhenHidden: true`**: Preserve webview JS state across tab switches.
