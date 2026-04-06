# Testing Standards

## Important

- **ALL** changes must be covered by unit-tests, end-to-end tests should be added for each interesting new user scenario for new features.
- The projects changed **MUST** successfully build before declaring success!
- Relevant tests **MUST** be building correctly and passing before declaring success!
- **Never** attempt to fix tests by increasing the timeout! It is always a test flaw for using indeterministic waits.

## Test Project Structure

This project uses two separate test suites with different runners:

| Suite      | Location            | Runner                         | Runs in                |
| ---------- | ------------------- | ------------------------------ | ---------------------- |
| Unit tests | `tests/unit-tests/` | **Vitest**                     | Node.js (no VS Code)   |
| E2E tests  | `tests/e2e-tests/`  | **Mocha** + `@vscode/test-cli` | VS Code Extension Host |

- The folder structure inside each test folder should mirror the source `src/` folder.
- Shared test utilities live in the respective test folder (e.g., `tests/e2e-tests/helpers.ts`).
- E2E test fixtures live in `tests/e2e-tests/fixtures/`.
- Each test file follows the naming pattern: `<source-file>.test.ts`.
- Each `describe` block should be named after the class or module under test.

### Running Tests

```bash
cd src
npm test                     # Unit tests (Vitest)
npm run test:coverage        # Unit tests with V8 coverage
npm run pretest:integration  # Build + compile e2e tests
npm run test:integration     # E2E tests in Extension Host
```

## Test Naming Pattern

Tests should read as a **living specification**. Use descriptive names that explain the behavior:

```ts
// Pattern: "should <expected behavior> when <scenario>"
describe("ConsoleTelemetrySender", () => {
    it("should write event name and data to output channel", () => { });
    it("should write event name without data when data is omitted", () => { });
    it("should include timestamp in every log entry", () => { });
});

describe("createTelemetry", () => {
    it("should return TelemetryReporter when connection string is provided", () => { });
    it("should return TelemetryLogger when no connection string is provided", () => { });
});
```

For parameterized tests, use `it.each`:

```ts
it.each([
    { input: "", expected: false },
    { input: "test", expected: true },
])("should return $expected when input is '$input'", ({ input, expected }) => {
    expect(validateInput(input)).toBe(expected);
});
```

## Test Structure (AAA Pattern)

```ts
it("should return encrypted value when given a valid string", () => {
    // Arrange — set up test data and dependencies
    const mockService = vi.fn<IService>();
    const sut = new SystemUnderTest(mockService);

    // Act — execute the method being tested
    const result = sut.encrypt("hello");

    // Assert — verify expected outcomes
    expect(result).toBeDefined();
    expect(result.value).toBe(expectedValue);
    expect(mockService).toHaveBeenCalledOnce();
});
```

## Unit Tests (`tests/unit-tests/`)

### Framework & API

- **Runner**: Vitest
- **Config**: `src/vitest.config.ts`
- **Imports**: `describe`, `it`, `expect`, `vi`, `beforeEach` from `"vitest"`

### Mocking the `vscode` Module

Unit tests run outside VS Code, so the `vscode` module must be mocked at the top of each test file:

```ts
vi.mock("vscode", () => ({
    commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    },
    window: {
        showInformationMessage: vi.fn(),
        createOutputChannel: vi.fn(() => ({
            appendLine: vi.fn(),
            dispose: vi.fn(),
        })),
    },
    env: {
        createTelemetryLogger: vi.fn(() => ({
            logUsage: vi.fn(),
            logError: vi.fn(),
            dispose: vi.fn(),
        })),
    },
}));
```

Only mock the parts of the `vscode` API that the module under test actually uses. Keep mocks minimal.

### Mocking Other Modules

Use `vi.mock()` for module-level mocks and `vi.fn()` for individual function stubs:

```ts
vi.mock("../src/telemetry", () => ({
    createTelemetry: vi.fn(() => ({ dispose: vi.fn() })),
}));
```

### Unit Test Guidelines

- Test a single class/function in isolation.
- Mock all external dependencies (VS Code API, other modules, file system).
- Fast execution (< 100ms per test).
- No side effects — no real file system, network, or VS Code host.
- Should comprise **70–80%** of the test suite.
- Use `beforeEach` with `vi.clearAllMocks()` to reset state between tests.

## E2E Tests (`tests/e2e-tests/`)

### Framework & API

- **Runner**: Mocha (TDD UI) + `@vscode/test-cli` + `@vscode/test-electron`
- **Config**: `src/.vscode-test.mjs`
- **Assertions**: Node.js built-in `assert` module
- **Syntax**: `suite` / `test` (Mocha TDD UI)

### E2E Test Guidelines

- Tests run inside a real VS Code Extension Host with the extension loaded.
- Use the real `vscode` API — **do not mock it** in E2E tests.
- Tests validate end-to-end behaviors that unit tests cannot cover: activation, real command execution, workspace interactions, Extension Host integration.
- Tests open the `tests/e2e-tests/fixtures/empty-workspace` by default; add more fixtures as needed.
- Extensions are disabled (`--disable-extensions`) to isolate the extension under test.
- Timeout per test is 15 seconds (configured in `.vscode-test.mjs`). If a test needs more, the test is likely flawed.

### E2E Test Structure

```ts
import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Lifecycle", () => {
    test("extension is present", () => {
        const ext = vscode.extensions.getExtension("publisher.extension-name");
        assert.ok(ext, "Extension should be installed");
    });

    test("extension activates successfully", async () => {
        const ext = vscode.extensions.getExtension("publisher.extension-name");
        assert.ok(ext, "Extension should be installed");
        await ext.activate();
        assert.strictEqual(ext.isActive, true, "Extension should be active after activation");
    });

    test("commands are registered after activation", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes("prefix.commandId"), "prefix.commandId should be registered");
    });
});
```

### What to Test in E2E

- Extension activation and deactivation lifecycle.
- Command registration and execution via `vscode.commands.executeCommand`.
- Interaction with the workspace (file creation, reading, watchers).
- Status bar items, output channels, and other visible side effects.
- Error handling for real-world edge cases (missing files, invalid input).

### Helpers

Use `tests/e2e-tests/helpers.ts` for shared utilities:

```ts
import { getWorkspaceFolder, uriExists, writeTextFile } from "./helpers";
```

### Debugging E2E Tests

1. Set breakpoints in any `.ts` file under `tests/e2e-tests/`.
2. Select the **"Integration Tests"** launch configuration.
3. Press **F5** — VS Code opens an Extension Development Host and runs the tests with the debugger attached.

## Code Coverage

### Requirements

- Minimum **85%** code coverage for new code (V8 provider via Vitest).
- **IMPORTANT**: Focus on meaningful tests that verify behavior, not on chasing coverage numbers!

### Exclusions

- `extension.ts` entry point (thin orchestration layer, covered by E2E tests)
- Config files (`vitest.config.ts`, `esbuild.config.mjs`, `.vscode-test.mjs`)
- Auto-generated code
- Trivial pass-through functions

## Prefer Specific Assertions

```ts
// Good — clear intent
expect(result.count).toBe(5);
expect(result.isSuccess).toBe(true);
expect(() => sut.method(null)).toThrow(TypeError);
expect(mockFn).toHaveBeenCalledWith("expected-arg");
expect(mockFn).toHaveBeenCalledOnce();

// Avoid — vague
expect(result.count === 5).toBe(true);
expect(!result.isSuccess).toBe(false);
```

For E2E tests using Node `assert`:

```ts
// Good
assert.strictEqual(result, expected, "descriptive failure message");
assert.ok(condition, "descriptive failure message");
assert.throws(() => sut.method(null), TypeError);

// Avoid
assert.ok(result === expected);
```

Always include the third `message` argument in `assert` calls to make failures self-explanatory.

## Constants for Test Data

Define commonly used test values in a shared constants file per test suite when needed.

## Anti-Patterns to Avoid

- **Testing implementation details**: Test behavior and observable outcomes, not internal method calls or private state.
- **Fragile tests**: Tests that break with minor refactoring indicate coupling to implementation.
- **Test interdependence**: Each test must be independent and runnable alone. Use `beforeEach` to reset state.
- **Skipping tests**: Never commit `it.skip(...)` or `test.skip(...)` without a linked issue or plan to fix.
- **Over-mocking**: Don't mock everything — test with real objects when they are simple and deterministic.
- **Asserting on mock internals**: Prefer asserting on outputs and side effects over how many times a mock was called.
- **Snapshot abuse**: Avoid snapshot tests for dynamic or frequently changing output. Use explicit assertions.
- **Non-deterministic waits**: Never use `setTimeout` or arbitrary delays. Use VS Code API events, polling with assertions, or Vitest's `vi.useFakeTimers()` instead.
