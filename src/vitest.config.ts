import { defineConfig } from "vitest/config";

// Unit test configuration — tests run in plain Node.js (no VS Code host).
// For integration tests that need a real Extension Host, see .vscode-test.mjs.
export default defineConfig({
    test: {
        include: ["../tests/unit-tests/**/*.test.ts"],
        // The default 5s timeout is too tight under coverage: Istanbul instruments the entire
        // module graph on the first dynamic import (e.g. extension.test.ts importing src/extension),
        // which can exceed 5s on slower machines even though the same test passes in ~2s without
        // instrumentation. A higher ceiling keeps coverage runs reliable without masking real hangs.
        testTimeout: 20000,
        coverage: {
            provider: "istanbul",
            // Only instrument TypeScript source files — avoids Istanbul trying to transform
            // YAML, HTML, or other non-JS files under resources/ or legacy coverage/.
            include: ["**/*.ts"],
            // extension.ts is a thin orchestration layer tested via E2E instead.
            // types.ts contains only TypeScript interfaces with no executable code.
            // Istanbul's instrumenter returns null for interface-only files, which crashes
            // the provider's getCoverageMapForUncoveredFiles in @vitest/coverage-istanbul@3.2.4
            // if there is no null-check before addFileCoverage(). Use **/ prefix to ensure
            // reliable matching on Windows regardless of path separator direction.
            exclude: [
                "**/extension.ts",
                "**/types.ts",
                "**/vitest.config.ts",
                "**/esbuild.config.mjs",
                "**/*.test.ts",
                // webview/** files are browser-only: they import DOM globals (document,
                // window, etc.) and execute inside the VS Code webview, so they cannot run
                // under Node/Vitest. Their behaviour is covered by E2E tests instead — the
                // same rationale used for extension.ts above.
                "**/webview/**",
                // resources/** contains seed template files (e.g. _shared/snippets/*.ts)
                // that are copied verbatim into the user's workspace by blueprints. They are
                // not part of the extension's runtime code path and are never imported here.
                "**/resources/**",
                "node_modules/**",
                "dist/**",
                ".vscode-test/**",
            ],
            // allowExternal: true sets relativePath: false in the underlying TestExclude,
            // which is required on Windows. Vite internally references files as
            // "/F:/path/..." (POSIX-style with leading slash) but TestExclude with
            // relativePath: true converts them via path.relative(cwd, id) and produces
            // "..\..\F:\path\..." — a path that never matches "**/*.ts". Setting
            // allowExternal: true bypasses that conversion so shouldInstrument() works.
            allowExternal: true,
            thresholds: {
                statements: 85,
                branches: 85,
                functions: 85,
                lines: 85,
            },
        },
    },
});
