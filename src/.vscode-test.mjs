import { defineConfig } from "@vscode/test-cli";
import { tmpdir } from "os";
import { join } from "path";

// Use OS temp dir for VS Code test instance data — avoids conflicts with a
// running VS Code and sidesteps Windows issues with spaces in paths.
const testDataDir = join(tmpdir(), "memoria-vscode-test");

// Integration test runner — launches a real VS Code instance with the extension loaded.
// Tests run inside the Extension Host process using Mocha (TDD UI).
export default defineConfig({
    // Compiled test output — e2e tests are authored in TS and compiled separately.
    files: "dist/test/e2e-tests/**/*.test.js",
    extensionDevelopmentPath: "./",
    workspaceFolder: "../tests/e2e-tests/fixtures/empty-workspace",
    // Disable other extensions to isolate the extension under test.
    // Explicit --user-data-dir / --extensions-dir with space-free paths so the
    // test instance uses its own profile and doesn't clash with a running VS Code.
    launchArgs: [
        "--disable-extensions",
        `--user-data-dir=${join(testDataDir, "user-data")}`,
        `--extensions-dir=${join(testDataDir, "extensions")}`,
    ],
    mocha: {
        ui: "tdd",
        timeout: 15_000,
    },
});
