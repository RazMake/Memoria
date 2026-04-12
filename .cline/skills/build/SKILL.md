---
name: build
description: How to build the VS Code extension. Compiles TypeScript via esbuild into a single CJS bundle.
---

# Build

Builds the extension source into `src/dist/extension.js` using esbuild.

On first clone (when `node_modules/` doesn't exist), the `prebuild` hook automatically runs `npm install`. Subsequent builds skip this step entirely.

## VS Code Task (preferred)

Use `run_task` with task ID `"npm: Memoria: Build extension"` — this is the default build task (Ctrl+Shift+B).

## Terminal fallback

```bash
cd src
npm run build
```

This runs `node esbuild.config.mjs`, which:

- Bundles `extension.ts` and all imports into a single CJS file.
- Externalizes only `vscode` (provided by the Extension Host at runtime).
- Targets Node 20.
- In development (`NODE_ENV !== "production"`): generates source maps, skips minification.
- In production (`NODE_ENV=production`): minifies, no source maps.

## Production Build

```bash
cd src
NODE_ENV=production npm run build
```

## Verify

After building, confirm `src/dist/extension.js` exists:

```bash
ls src/dist/extension.js
```
