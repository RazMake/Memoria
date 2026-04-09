import { build } from "esbuild";

// Development builds include sourcemaps for debugging; production builds are minified for size.
const isDev = process.env.NODE_ENV !== "production";

await build({
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
    sourcemap: isDev,
    minify: !isDev,
});
