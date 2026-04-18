import { build } from "esbuild";

// Development builds include sourcemaps for debugging; production builds are minified for size.
const isDev = process.env.NODE_ENV !== "production";

await Promise.all([
    build({
        entryPoints: ["extension.ts"],
        bundle: true,
        outfile: "dist/extension.js",
        // "vscode" is provided by the Extension Host at runtime — never bundle it.
        // "@vscode/extension-telemetry" is loaded via lazy require() in reporterFactory
        // and has transitive CJS dependencies that break static bundling.
        external: ["vscode", "@vscode/extension-telemetry"],
        format: "cjs",
        platform: "node",
        target: "node20",
        // Prefer ESM entry points over UMD/CJS — jsonc-parser's UMD wrapper uses an
        // AMD define() pattern that esbuild cannot statically resolve at bundle time.
        mainFields: ["module", "main"],
        sourcemap: isDev,
        minify: !isDev,
    }),
    build({
        entryPoints: ["features/todoEditor/webview/main.ts"],
        bundle: true,
        outfile: "dist/webview.js",
        format: "iife",
        platform: "browser",
        target: "es2022",
        sourcemap: isDev,
        minify: !isDev,
    }),
]);
