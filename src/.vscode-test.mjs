import { defineConfig } from "@vscode/test-cli";

// Integration test runner — launches a real VS Code instance with the extension loaded.
// Tests run inside the Extension Host process using Mocha (TDD UI).
export default defineConfig({
    // Compiled test output — e2e tests are authored in TS and compiled separately.
    files: "dist/test/e2e-tests/**/*.test.js",
    extensionDevelopmentPath: "./",
    workspaceFolder: "../tests/e2e-tests/fixtures/empty-workspace",
    // Disable other extensions to isolate the extension under test.
    launchArgs: ["--disable-extensions"],
    mocha: {
        ui: "tdd",
        timeout: 15_000,
    },
});
