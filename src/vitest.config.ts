import { defineConfig } from "vitest/config";

// Unit test configuration — tests run in plain Node.js (no VS Code host).
// For integration tests that need a real Extension Host, see .vscode-test.mjs.
export default defineConfig({
    test: {
        include: ["../tests/unit-tests/**/*.test.ts"],
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
