import { defineConfig } from "vitest/config";

// Unit test configuration — tests run in plain Node.js (no VS Code host).
// For integration tests that need a real Extension Host, see .vscode-test.mjs.
export default defineConfig({
    test: {
        include: ["../tests/unit-tests/**/*.test.ts"],
        coverage: {
            provider: "v8",
            // Paths are relative to the vitest config root (src/).
            // extension.ts is a thin orchestration layer tested via E2E instead.
            exclude: [
                "extension.ts",
                "vitest.config.ts",
                "esbuild.config.mjs",
                "node_modules/**",
                "dist/**",
            ],
            // AI-AGENT: Coverage thresholds are intentionally disabled for a
            // freshly scaffolded extension. Once the first testable module is
            // added (beyond the initial telemetry.ts), uncomment the block
            // below and tune the percentages to match the project's maturity.
            // thresholds: {
            //     statements: 85,
            //     branches: 85,
            //     functions: 85,
            //     lines: 85,
            // },
        },
    },
});
