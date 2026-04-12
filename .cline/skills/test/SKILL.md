---
name: test
description: How to run unit tests (Vitest) and integration tests (Mocha + @vscode/test-cli) for the VS Code extension, including code coverage.
---

# Test

This extension has two test suites:

| Suite | Runner | Location | Runs in |
|---|---|---|---|
| Unit tests | Vitest | `tests/unit-tests/` | Node.js (no VS Code needed) |
| Integration tests (e2e) | Mocha + @vscode/test-cli | `tests/e2e-tests/` | VS Code Extension Host |

## Unit Tests

Fast tests that mock the `vscode` API. Use these for business logic, utilities, and isolated module behavior.

### Run (VS Code task — preferred)

Use `run_task` with task ID `"npm: Memoria: Run unit-tests"` — this is the default test task.

### Run (terminal fallback)

```bash
cd src
npm test
```

### Run with Coverage (VS Code task — preferred)

Use `run_task` with task ID `"npm: Memoria: Check unit-test:coverage"`.

### Run with Coverage (terminal fallback)

```bash
cd src
npm run test:coverage
```

Coverage is generated via the V8 provider. Reports are output to `coverage/`.

### Writing Unit Tests

- Place test files in `tests/unit-tests/` with the naming pattern `*.test.ts`.
- Mock the `vscode` module using `vi.mock("vscode", () => ({ ... }))`.
- Use `describe`, `it`, `expect`, `vi` from Vitest.

## Integration Tests (e2e)

Tests that run inside a real VS Code Extension Host. Use these to verify extension activation, command registration, workspace operations, and other behaviors that depend on the VS Code runtime.

### Run (VS Code task — preferred)

Use `run_task` with task ID `"npm: Memoria: Run e2e-tests"`.

### Run (terminal fallback)

```bash
cd src
npm run test:integration
```

This runs `vscode-test`, which:
1. Builds the extension and compiles e2e test TypeScript (via `pretest:integration`).
2. Downloads a VS Code instance (if not cached).
3. Opens the `tests/e2e-tests/fixtures/empty-workspace/` fixture.
4. Runs Mocha tests inside the Extension Host.

### Debug

1. Open the project in VS Code.
2. Select the **"Integration Tests"** launch configuration.
3. Press **F5**.

This launches the Extension Host with the test configuration and attaches the debugger.

### Writing Integration Tests

- Place test files in `tests/e2e-tests/` with the naming pattern `*.test.ts`.
- Use Mocha TDD style: `suite`, `test`, `suiteSetup`, `teardown`.
- Import `vscode` directly (the real API is available in the Extension Host).
- Use helpers from `tests/e2e-tests/helpers.ts` for common workspace operations.

### Configuration

Integration test behavior is configured in `src/.vscode-test.mjs`:

```js
defineConfig({
    files: "dist/test/e2e-tests/**/*.test.js",
    workspaceFolder: "../tests/e2e-tests/fixtures/empty-workspace",
    launchArgs: ["--disable-extensions"],
    mocha: { ui: "tdd", timeout: 15_000 },
})
```
