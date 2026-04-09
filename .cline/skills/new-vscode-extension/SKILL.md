---
name: new-vscode-extension
description: Scaffolds a VS Code extension from scratch in a blank repository — creates all config, build, unit test, integration test infrastructure, telemetry, and AI agent skills
license: MIT
---

Scaffold a new VS Code extension from scratch. This prompt is self-contained and works in any repository.

## Required Arguments

Ask the user for any that are missing before proceeding:

| Argument | Description | Example |
|---|---|---|
| `extensionName` | PascalCase folder name | `MyTool` |
| `commandPrefix` | camelCase prefix for all command IDs | `myTool` |
| `displayName` | Human-readable name shown in VS Code | `My Tool` |
| `description` | One-sentence description for package.json | `Does something useful.` |
| `publisher` | VS Code marketplace publisher ID | `myPublisher` |
| `commands` | List of `{ id, title }` objects | `[{ id: "doThing", title: "Do Thing" }]` |

If `commands` is empty or not provided, scaffold with zero commands (empty arrays).

## Tech Stack

- **Language**: TypeScript (latest stable), strict mode
- **Build**: esbuild → CJS, `external: ["vscode"]`, `platform: "node"`, `target: "node20"`
- **Telemetry**: `@vscode/extension-telemetry` with local console fallback (no AppInsights key required for development). The telemetry module uses **dependency injection** — see the Testability section below.
- **Unit tests**: Vitest — runs from `tests/unit-tests/`, v8 coverage provider
- **Decision record**: ADR-0001 — see [adr/adr-0001-use-vitest-for-unit-tests.md](adr/adr-0001-use-vitest-for-unit-tests.md)
- **Decision record**: ADR-0002 — see [adr/adr-0002-vs-code-extension-integration-test-runner.md](adr/adr-0002-vs-code-extension-integration-test-runner.md)
- **Integration tests**: Mocha + `@vscode/test-cli` + `@vscode/test-electron` — runs from `tests/e2e-tests/`
- **Min VS Code version**: `^1.100.0`
- **Activation event**: `onStartupFinished`
- **AI agent skills**: Shared `.cline/skills/` folder for both Cline and Copilot agents

## Directory Layout to Create

```
├── .memory-bank/              ← Persistent context for Cline/Copilot dual-agent workflows
├── .cline/                    ← Agent configuration root
│   └── skills/                ← AI agent skills (shared by Cline and Copilot via settings.json)
│       ├── build/             ← How to build the extension
│       │   └── SKILL.md
│       ├── publish/           ← How to create VSIX publish artifacts
│       │   └── SKILL.md
│       ├── test/              ← How to run unit and integration tests
│       │   └── SKILL.md
│       └── security-review/   ← AI-powered codebase security scanner
│           ├── SKILL.md
│           └── references/    ← Detection patterns and report templates for security scanner
│               ├── language-patterns.md
│               ├── report-format.md
│               ├── secret-patterns.md
│               ├── vuln-categories.md
│               └── vulnerable-packages.md
├── .vscode/                   ← VS Code workspace configuration
│   ├── launch.json            ← Debug/run configurations (Run Extension, Integration Tests)
│   ├── tasks.json             ← Build and test tasks (aligned with npm scripts and skills)
│   └── settings.json          ← Workspace settings (chat.skillsLocations → .cline/skills)
├── src/                       ← Extension source code and build config
│   ├── extension.ts           ← Entry point (activate/deactivate)
│   ├── telemetry.ts           ← Telemetry module (AppInsights or local console fallback)
│   ├── package.json           ← Extension manifest, dependencies, and npm scripts
│   ├── tsconfig.json          ← TypeScript compiler configuration
│   ├── esbuild.config.mjs     ← esbuild bundler configuration (CJS, node20)
│   ├── vitest.config.ts       ← Unit test runner configuration
│   ├── .vscodeignore          ← Files excluded from VSIX package
│   └── .vscode-test.mjs       ← @vscode/test-cli integration test configuration
├── tests/                     ← All test suites
│   ├── unit-tests/            ← Vitest unit tests (run outside VS Code, mock vscode API)
│   │   ├── extension.test.ts
│   │   └── telemetry.test.ts
│   └── e2e-tests/             ← Mocha integration tests (run inside VS Code Extension Host)
│       ├── tsconfig.json      ← TypeScript config for e2e test compilation
│       ├── helpers.ts         ← Shared test utilities (workspace, file operations)
│       ├── extension.test.ts  ← Extension lifecycle tests (activation, commands)
│       └── fixtures/          ← Test workspace fixtures
│           └── empty-workspace/
│               └── .gitkeep
├── docs/                      ← Project documentation
│   ├── adrs/                  ← Architectural Decision Records
│   │   ├── adr-0001-use-vitest-for-unit-tests.md
│   │   └── adr-0002-vs-code-extension-integration-test-runner.md
│   └── dev/                   ← Developer documentation
│       ├── info/              ← Architecture diagrams and extension information
│       │   └── vscode-extension-lifecycle.md
│       └── tsg/               ← Troubleshooting guides and dev how-tos
│           └── .gitkeep
├── publish/                   ← VSIX package output (keeps current + 2 previous versions)
│   └── .gitkeep
├── .gitignore
├── CHANGELOG.md
└── README.md
```

### Agent Skills

The `.cline/skills/` directory contains AI agent skills that are deployed verbatim from the
[skills/](skills/) folder in this scaffold template. Copy each skill folder into the target
project's `.cline/skills/` directory, preserving the directory structure exactly. The security-review
skill includes a `references/` subdirectory with 5 reference files that must also be copied.

---

## Testability — CJS Wrapper Pattern

`@vscode/extension-telemetry` is a CJS package that calls `require("vscode")` at load time.
This breaks Vitest unit tests because `vscode` is a virtual module provided only by the Extension Host.
`vi.mock("vscode")` cannot intercept a CJS `require()` inside `node_modules`.

**Solution**: `telemetry.ts` never imports `@vscode/extension-telemetry` directly. Instead it
accepts a `TelemetryReporterFactory` function via its options object. `extension.ts` provides
that factory using a **lazy `require()`** inside an arrow function body, so the CJS package is
only loaded when `activate()` runs (inside the real Extension Host). Unit tests that mock
`../../src/telemetry` never trigger the `require()` at all.

This pattern applies to **any** CJS dependency that calls `require("vscode")` at the top level.
Always wrap such dependencies behind an injected factory rather than importing them in modules
that need to be unit-tested.

---

## Scaffolding Order

Deploy files in this exact order so that coding standards and architectural decisions are
available before code generation begins. The agent MUST read the existing repo instruction
files and deploy bundled agent skills BEFORE scaffolding any source code.

1. **Agent skills** (`.cline/skills/`) — deploy bundled AI agent workflows
2. **Read existing instructions** (`.github/instructions/`) — read all pre-existing coding standards, commenting policy, testing guidelines, and design principles so they are loaded before writing any code
3. **Architectural Decision Records** (`docs/adrs/`) — rationale for tech choices
4. **Configuration & infrastructure** (`.gitignore`, `.vscode/`, `package.json`, `tsconfig.json`, build config)
5. **Source code** (`src/`) — extension entry point, modules
6. **Tests** (`tests/`) — unit and e2e tests
7. **Documentation & placeholders** (`docs/`, `publish/`, `CHANGELOG.md`, `README.md`)

---

## Files to Create

Substitute all `<placeholder>` values with the provided arguments.

---

### Phase 1: Read Existing Instructions & Deploy Agent Skills

The repository already contains AI coding instructions in `.github/instructions/`.
Do **not** create or overwrite these files — they are pre-existing.

1. **Deploy agent skills** — copy the bundled `.cline/skills/` folders into the target project
   (see the Agent Skills section above for details).
2. **Read** all files under `.github/instructions/` (including `focusedInstructions/`) so that
   coding standards, commenting policy, design principles, and testing guidelines are loaded
   before writing any code.

After reading and deploying, proceed to Phase 2.

---

### Phase 2: Architectural Decision Records

---

### `docs/adrs/adr-0001-use-vitest-for-unit-tests.md`

```md
---
title: "ADR-0001: Use Vitest for Unit Tests"
status: "Accepted"
date: "2026-04-05"
authors: "Razvan"
tags: ["testing", "tooling", "typescript"]
supersedes: ""
superseded_by: ""
---

# ADR-0001: Use Vitest for Unit Tests

## Status

Proposed | **Accepted** | Rejected | Superseded | Deprecated

## Context

We are starting a TypeScript/Node codebase (VS Code extension). We need a unit-test framework that:

- Runs quickly in local development and CI
- Works well with TypeScript without requiring a separate compile step for unit tests
- Provides a productive assertion/mocking API (spies, stubs, module mocking) for typical unit-level isolation
- Produces reliable coverage output suitable for enforcing a baseline threshold
- Works consistently across Windows/macOS/Linux

This ADR covers unit tests only. VS Code Extension Host integration/e2e testing is addressed separately.

## Decision

We will use Vitest as the unit-test runner for this repository (and for repositories scaffolded by the new-vscode-extension skill).

Rationale:

- Vitest provides a fast feedback loop and good developer experience for TypeScript projects.
- It includes a Jest-like API for assertions and mocking, reducing onboarding time.
- Coverage integration via V8 is straightforward and CI-friendly.

## Consequences

### Positive

- **POS-001**: Fast execution and watch mode improve the edit-run-debug loop.
- **POS-002**: TypeScript-first authoring is supported with minimal configuration.
- **POS-003**: Built-in mocking/spying (vi) and familiar expect/matcher patterns reduce boilerplate.
- **POS-004**: Coverage reporting using V8 is simple and performs well.

### Negative

- **NEG-001**: Adds dependencies and configuration compared to Node's built-in test runner.
- **NEG-002**: Some Jest-only utilities/plugins are not drop-in compatible.
- **NEG-003**: Module-mocking behavior differs from Jest in some edge cases, which can influence test design.
- **NEG-004**: The test stack becomes coupled to the Vitest ecosystem (upgrades, breaking changes over time).

## Alternatives Considered

### Jest

- **ALT-001**: **Description**: Widely adopted test runner with a large ecosystem, mature mocking, and extensive examples.
- **ALT-002**: **Rejection Reason**: Typically heavier/slower; TypeScript + ESM/CJS transform configuration can be more complex than Vitest for a small TS/Node codebase.

### Node built-in node:test

- **ALT-003**: **Description**: Zero-dependency runner built into Node.js; good fit for pure Node logic.
- **ALT-004**: **Rejection Reason**: Less batteries-included for assertions/mocking/snapshots; TypeScript ergonomics often require additional tooling; coverage/reporting is less turnkey.

### Mocha (unit tests)

- **ALT-005**: **Description**: Stable and flexible runner; can pair with Chai/Sinon and c8/nyc for coverage.
- **ALT-006**: **Rejection Reason**: Requires assembling multiple libraries for a comparable experience; more setup/boilerplate than Vitest for TS-first unit tests.

### AVA / uvu / tap

- **ALT-007**: **Description**: Lightweight runners with good performance characteristics.
- **ALT-008**: **Rejection Reason**: Smaller ecosystem and fewer familiar patterns; generally less standard for TypeScript/Node extension projects than Vitest/Jest.

## Implementation Notes

- **IMP-001**: Add Vitest and @vitest/coverage-v8 as dev dependencies.
- **IMP-002**: Add scripts: test (vitest run) and test:coverage (vitest run --coverage).
- **IMP-003**: Standardize unit test location and naming (for example, tests/unit-tests/**/*.test.ts) and keep tests runnable without VS Code.
- **IMP-004**: Configure coverage include/exclude rules and an initial threshold baseline (tune per repository as it matures).

## References

- **REF-001**: Vitest documentation — https://vitest.dev/
- **REF-002**: Jest documentation — https://jestjs.io/
- **REF-003**: Node.js test runner documentation — https://nodejs.org/api/test.html
```

---

### `docs/adrs/adr-0002-vs-code-extension-integration-test-runner.md`

```md
---
title: "ADR-0002: VS Code Extension Integration Test Runner"
status: "Accepted"
date: "2026-04-05"
authors: "Razvan"
tags: ["testing", "tooling", "vscode", "integration"]
supersedes: ""
superseded_by: ""
---

# ADR-0002: VS Code Extension Integration Test Runner

## Status

Proposed | **Accepted** | Rejected | Superseded | Deprecated

## Context

We need integration tests that run inside a real VS Code Extension Host to validate behaviors that unit tests (mocked vscode) cannot reliably cover, including:

- Extension activation and command registration
- Workspace filesystem operations (vscode.workspace.fs)
- Workspace settings updates (vscode.workspace.getConfiguration)
- Wiring that depends on host services (watchers/providers/context keys)

We want a runner that is:

- Easy to run locally and in CI
- Easy to debug
- Standard enough that new contributors recognize it immediately
- Low-maintenance (minimal custom glue code)

This ADR covers VS Code Extension Host integration testing only. Unit tests (mocked vscode) are addressed separately.

## Decision

We will use @vscode/test-cli (the vscode-test command) as the primary integration test runner, using @vscode/test-electron for desktop execution.

Integration test framework remains Mocha.

Integration tests are authored in TypeScript and compiled to JavaScript before execution.

Unit tests remain Vitest (fast, mocked vscode), and integration tests remain a separate suite.

Rationale:

- @vscode/test-cli provides a standardized, contributor-friendly CLI workflow for running Extension Host tests.
- Using the vscode-test command reduces bespoke runner glue compared to calling @vscode/test-electron directly.
- Mocha remains the de-facto standard for VS Code extension integration tests and keeps the stack familiar.

## Consequences

### Positive

- **POS-001**: Integration tests exercise real Extension Host behaviors (activation, registration, workspace services).
- **POS-002**: A standard runner/CLI improves local + CI consistency and reduces maintenance burden.
- **POS-003**: Debugging inside an actual Extension Host becomes straightforward with standard launch configurations.

### Negative

- **NEG-001**: Integration tests require build/compile steps and are slower than unit tests.
- **NEG-002**: Adds dev dependencies and runner configuration (in addition to the unit-test stack).
- **NEG-003**: Extension Host tests can be more sensitive to environment/VS Code version changes than mocked unit tests.

## Alternatives Considered

### Custom runner using @vscode/test-electron directly

- **ALT-001**: **Description**: Implement a custom integration test runner that calls @vscode/test-electron programmatically (common sample pattern).
- **ALT-002**: **Rejection Reason**: More bespoke glue; less ergonomic filtering/watch; less standardized tooling UX.

### UI automation E2E (Playwright/Selenium-driven VS Code UI)

- **ALT-003**: **Description**: Drive VS Code's UI for end-to-end workflows (QuickPick, input boxes, webviews).
- **ALT-004**: **Rejection Reason**: Slow and flaky with higher setup/maintenance costs; rejected as primary infrastructure (may be considered later for truly UI-critical workflows only).

### Unit tests only (mocked vscode)

- **ALT-005**: **Description**: Rely exclusively on unit tests with mocked vscode APIs.
- **ALT-006**: **Rejection Reason**: Cannot validate activation/packaging/host wiring and misses real Extension Host regressions.

## Implementation Notes

- **IMP-001**: Add dev dependencies: @vscode/test-cli and @vscode/test-electron.
- **IMP-002**: Add a .vscode-test.* configuration file defining compiled test file globs, VS Code version/quality (default stable), workspace fixture to open, Mocha defaults (UI/timeout), and launch args (for example, --disable-extensions) for isolation.
- **IMP-003**: Keep a dedicated TypeScript compile step for integration tests.
- **IMP-004**: Update npm scripts so integration tests run via vscode-test (after build + test compilation).
- **IMP-005**: Ensure there's a debug workflow for integration tests (via VS Code's test runner integration or an extensionHost launch configuration).

## References

- **REF-001**: @vscode/test-cli — https://www.npmjs.com/package/@vscode/test-cli
- **REF-002**: @vscode/test-electron — https://www.npmjs.com/package/@vscode/test-electron
- **REF-003**: VS Code extension testing — https://code.visualstudio.com/api/working-with-extensions/testing-extension
```

---

### Phase 3: Configuration, Source Code, Tests & Documentation

---

### `.gitignore`

```
node_modules/
dist/
coverage/
.vscode-test/
*.vsix
publish/
```

---

### `.vscode/settings.json`

```json
{
    "chat.skillsLocations": [".cline/skills"]
}
```

---

### `src/package.json`

```json
{
    "name": "<extensionName-lowercase>",
    "displayName": "<displayName>",
    "description": "<description>",
    "version": "0.0.1",
    "publisher": "<publisher>",
    "engines": {
        "vscode": "^1.100.0"
    },
    "categories": ["Other"],
    "activationEvents": ["onStartupFinished"],
    "main": "./dist/extension.js",
    "contributes": {
        "commands": [
            /* one entry per command:
               { "command": "<commandPrefix>.<id>", "title": "<title>", "category": "<displayName>" } */
        ],
        "menus": {
            "commandPalette": [
                /* one entry per command: { "command": "<commandPrefix>.<id>" } */
            ]
        }
    },
    "scripts": {
        "build": "node esbuild.config.mjs",
        "test": "vitest run",
        "test:coverage": "vitest run --coverage",
        "compile:tests": "tsc -p ../tests/e2e-tests/tsconfig.json",
        "pretest:integration": "npm run build && npm run compile:tests",
        "test:integration": "vscode-test",
        "package": "vsce package --out ../publish/"
    },
    "dependencies": {
        "@vscode/extension-telemetry": "^0.9.8"
    },
    "devDependencies": {
        "@types/vscode": "^1.100.0",
        "@types/mocha": "^10.0.0",
        "@types/node": "^20.0.0",
        "typescript": "^5.8.3",
        "esbuild": "^0.25.2",
        "vitest": "^3.1.1",
        "@vitest/coverage-v8": "^3.1.1",
        "mocha": "^11.0.0",
        "@vscode/test-cli": "^0.0.8",
        "@vscode/test-electron": "^2.4.1",
        "@vscode/vsce": "^3.3.2"
    }
}
```

**Rules**:
- `name` must be all-lowercase (kebab-case if multi-word).
- Populate `contributes.commands` and `menus.commandPalette` from the user-supplied commands.
- `@vscode/extension-telemetry` is a runtime dependency (bundled by esbuild, not in `external`).

---

### `src/esbuild.config.mjs`

```js
import { build } from "esbuild";

// Development builds include sourcemaps for debugging; production builds are minified for size.
const isDev = process.env.NODE_ENV !== "production";

await build({
    entryPoints: ["extension.ts"],
    bundle: true,
    outfile: "dist/extension.js",
    // "vscode" is provided by the Extension Host at runtime — never bundle it.
    external: ["vscode"],
    format: "cjs",
    platform: "node",
    target: "node20",
    sourcemap: isDev,
    minify: !isDev,
});
```

---

### `src/tsconfig.json`

```json
{
    "compilerOptions": {
        "module": "commonjs",
        "target": "ES2022",
        "lib": ["ES2022"],
        "types": ["node"],
        "strict": true,
        "outDir": "./dist",
        "rootDir": ".",
        "sourceMap": true,
        "skipLibCheck": true,
        "resolveJsonModule": true,
        "moduleResolution": "node",
        "esModuleInterop": true
    },
    "include": ["./**/*"],
    "exclude": ["node_modules", "dist"]
}
```

---

### `src/vitest.config.ts`

```ts
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
```

**Rules**:
- Do NOT use an `include` array for coverage — let V8 auto-discover from executed code. Only use `exclude` to filter out non-source files.
- Do NOT enable coverage thresholds in the initial scaffold. The comment tells developers when to enable them.

---

### `src/.vscodeignore`

```
.vscode-test/**
.vscode-test.mjs
**/*.ts
node_modules/**
coverage/**
dist/test/**
dist/**/*.map
*.config.mjs
vitest.config.ts
tsconfig.json
.gitignore
```

---

### `src/.vscode-test.mjs`

```js
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
```

---

### `.vscode/launch.json`

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Run Extension",
            "type": "extensionHost",
            "request": "launch",
            "args": ["--extensionDevelopmentPath=${workspaceFolder}/src"],
            "outFiles": ["${workspaceFolder}/src/dist/**/*.js"],
            "preLaunchTask": "npm: build"
        },
        {
            "name": "Integration Tests",
            "type": "extensionHost",
            "request": "launch",
            "testConfiguration": "${workspaceFolder}/src/.vscode-test.mjs",
            "outFiles": ["${workspaceFolder}/src/dist/**/*.js"],
            "preLaunchTask": "npm: pretest:integration"
        }
    ]
}
```

---

### `.vscode/tasks.json`

**Rules**:
- Use `"problemMatcher": []` (empty array) for every task. Do NOT use `$esbuild-watch`, `$esbuild`, or any other non-built-in problem matcher — they do not exist in VS Code and will cause a blocking dialog when the task runs.
- Do NOT create a watch task with `"isBackground": true`. esbuild watch is not needed — the build task runs in < 100 ms and the launch configs invoke it as a preLaunchTask automatically.
- Deploy the tasks exactly as listed below — do not invent additional tasks or modify these.

```json
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "npm: build",
            "type": "npm",
            "script": "build",
            "path": "src/",
            "group": { "kind": "build", "isDefault": true },
            "presentation": { "reveal": "silent" },
            "problemMatcher": []
        },
        {
            "label": "npm: test",
            "type": "npm",
            "script": "test",
            "path": "src/",
            "group": { "kind": "test", "isDefault": true },
            "presentation": { "reveal": "always" },
            "problemMatcher": []
        },
        {
            "label": "npm: test:coverage",
            "type": "npm",
            "script": "test:coverage",
            "path": "src/",
            "presentation": { "reveal": "always" },
            "problemMatcher": []
        },
        {
            "label": "npm: pretest:integration",
            "type": "npm",
            "script": "pretest:integration",
            "path": "src/",
            "presentation": { "reveal": "always" },
            "problemMatcher": []
        },
        {
            "label": "npm: test:integration",
            "type": "npm",
            "script": "test:integration",
            "path": "src/",
            "group": { "kind": "test" },
            "presentation": { "reveal": "always" },
            "problemMatcher": []
        },
        {
            "label": "npm: package",
            "type": "npm",
            "script": "package",
            "path": "src/",
            "presentation": { "reveal": "always" },
            "problemMatcher": []
        }
    ]
}
```

---

### `src/telemetry.ts`

**CRITICAL — Testability**: This module must **never** import `@vscode/extension-telemetry`
directly. That package is CJS and calls `require("vscode")` at load time, which breaks
Vitest unit tests. Instead, it accepts a factory function via the options object.
See the "Testability — CJS Wrapper Pattern" section above.

```ts
import * as vscode from "vscode";

/** Minimal disposable interface returned by telemetry factories. */
export interface TelemetryReporterLike extends vscode.Disposable {
    // Marker — concrete type is opaque to callers.
}

/** Constructor signature for TelemetryReporter, injected from extension.ts. */
export type TelemetryReporterFactory = (connectionString: string) => TelemetryReporterLike;

/**
 * Writes telemetry events to a local VS Code OutputChannel
 * for development observability when no Application Insights key is configured.
 * In production, replace with a real connection string to route events to AppInsights.
 */
export class ConsoleTelemetrySender implements vscode.TelemetrySender {
    constructor(private readonly outputChannel: vscode.OutputChannel) {}

    sendEventData(eventName: string, data?: Record<string, any>): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(
            `[${timestamp}] EVENT: ${eventName}${data ? " " + JSON.stringify(data) : ""}`
        );
    }

    sendErrorData(error: Error, data?: Record<string, any>): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(
            `[${timestamp}] ERROR: ${error.message}${data ? " " + JSON.stringify(data) : ""}`
        );
    }

    flush(): void {}

    dispose(): void {}
}

export interface CreateTelemetryOptions {
    context: vscode.ExtensionContext;
    connectionString?: string;
    /** Factory that creates a TelemetryReporter — injected so this module never imports the CJS package directly. */
    createReporter?: TelemetryReporterFactory;
}

/**
 * Creates a telemetry reporter or logger.
 *
 * - With a connection string + factory: returns a TelemetryReporter that sends to Application Insights.
 * - Without: returns a TelemetryLogger that logs to a local OutputChannel.
 *
 * Both respect VS Code's telemetry.telemetryLevel user setting automatically.
 */
export function createTelemetry(
    options: CreateTelemetryOptions
): TelemetryReporterLike | vscode.TelemetryLogger {
    const { context, connectionString, createReporter } = options;

    if (connectionString && createReporter) {
        const reporter = createReporter(connectionString);
        context.subscriptions.push(reporter);
        return reporter;
    }

    const outputChannel = vscode.window.createOutputChannel("<displayName> Telemetry");
    const sender = new ConsoleTelemetrySender(outputChannel);
    const logger = vscode.env.createTelemetryLogger(sender);
    context.subscriptions.push(logger, outputChannel);
    return logger;
}
```

**Rules**:
- Replace `<displayName>` in the OutputChannel name with the actual display name.
- Do NOT add `import TelemetryReporter from "@vscode/extension-telemetry"` to this file.

---

### `src/extension.ts`

Generate a minimal but complete entry point:
1. Import `createTelemetry` and the `TelemetryReporterFactory` **type** from `./telemetry`.
2. Define a `reporterFactory` arrow function that **lazy-requires** `@vscode/extension-telemetry` inside its body. This defers the CJS `require()` so it only runs when `activate()` is called inside the real Extension Host — never during unit test module loading.
3. `activate(context)` initializes telemetry (passing the factory) and registers each command.
4. Each handler shows a placeholder info message.
5. Export an empty `deactivate(): void`.

**CRITICAL**: Do NOT use a top-level `import` or top-level `require()` for `@vscode/extension-telemetry`. It must be inside a function body (the arrow function) so unit tests that mock `./telemetry` never trigger it.

Example (adapt to actual commands):

```ts
import * as vscode from "vscode";
import { createTelemetry, type TelemetryReporterFactory } from "./telemetry";

/** Lazy factory — defers require("@vscode/extension-telemetry") to first call. */
const reporterFactory: TelemetryReporterFactory = (connectionString) => {
    const TelemetryReporter = require("@vscode/extension-telemetry").default;
    return new TelemetryReporter(connectionString);
};

// Extension entry point — called once when the activation event fires.
// Initializes telemetry and registers all commands.
export function activate(context: vscode.ExtensionContext): void {
    // Telemetry respects the user's telemetry.telemetryLevel setting automatically.
    const telemetry = createTelemetry({
        context,
        createReporter: reporterFactory,
    });

    // Push disposables to context.subscriptions so VS Code cleans them up on deactivation.
    context.subscriptions.push(
        vscode.commands.registerCommand("<commandPrefix>.doThing", () => {
            vscode.window.showInformationMessage("<displayName>: Do Thing");
        })
    );
}

export function deactivate(): void {}
```

---

### `tests/unit-tests/extension.test.ts`

**CRITICAL — Import Paths**: Test files live in `tests/unit-tests/`. Imports to source files
in `src/` must use `../../src/` (two levels up), NOT `../src/`.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Unit tests run outside VS Code, so the vscode module must be fully mocked.
// Only mock the API surface that the module under test actually uses.
const mockSubscriptions: any[] = [];
const mockRegisterCommand = vi.fn();
const mockShowInformationMessage = vi.fn();

vi.mock("vscode", () => ({
    commands: {
        registerCommand: (...args: any[]) => {
            mockRegisterCommand(...args);
            return { dispose: vi.fn() };
        },
    },
    window: {
        showInformationMessage: mockShowInformationMessage,
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

// Mock the telemetry module so the lazy require("@vscode/extension-telemetry")
// inside extension.ts's reporterFactory is never triggered during unit tests.
vi.mock("../../src/telemetry", () => ({
    createTelemetry: vi.fn(() => ({ dispose: vi.fn() })),
}));

describe("extension", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSubscriptions.length = 0;
    });

    it("activate is a function", async () => {
        const { activate } = await import("../../src/extension");
        expect(typeof activate).toBe("function");
    });

    it("deactivate is a function", async () => {
        const { deactivate } = await import("../../src/extension");
        expect(typeof deactivate).toBe("function");
    });

    it("activate registers commands", async () => {
        const { activate } = await import("../../src/extension");
        const context = {
            subscriptions: mockSubscriptions,
        } as any;

        activate(context);

        /* Verify that at least one command was registered.
           Adapt assertions below to match the actual scaffolded commands:
           expect(mockRegisterCommand).toHaveBeenCalledWith("<commandPrefix>.<id>", expect.any(Function)); */
        expect(mockRegisterCommand.mock.calls.length).toBeGreaterThanOrEqual(0);
    });

    it("deactivate returns void", async () => {
        const { deactivate } = await import("../../src/extension");
        expect(deactivate()).toBeUndefined();
    });
});
```

**Rules**:
- All `import()` and `vi.mock()` paths to source files MUST use `../../src/` (two directory levels up from `tests/unit-tests/`).
- Adapt the command assertions to match the actual commands supplied by the user.
- If the user supplied commands, add one `expect(mockRegisterCommand).toHaveBeenCalledWith(...)` assertion per command.

---

### `tests/unit-tests/telemetry.test.ts`

**CRITICAL — Import Paths**: Use `../../src/` for all source imports (two levels up from `tests/unit-tests/`).

**CRITICAL — No `@vscode/extension-telemetry` mock needed**: Because `telemetry.ts` uses the
injected factory pattern, it never imports the CJS package. Tests pass a plain mock factory
function instead. Do NOT add `vi.mock("@vscode/extension-telemetry")`.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConsoleTelemetrySender, createTelemetry } from "../../src/telemetry";

// Unit tests run outside VS Code — mock only the vscode API surface used by telemetry.ts.
vi.mock("vscode", () => ({
    window: {
        createOutputChannel: vi.fn((name: string) => ({
            appendLine: vi.fn(),
            dispose: vi.fn(),
            name,
        })),
    },
    env: {
        createTelemetryLogger: vi.fn((sender: any) => ({
            logUsage: vi.fn(),
            logError: vi.fn(),
            dispose: vi.fn(),
            sender,
        })),
    },
}));

describe("ConsoleTelemetrySender", () => {
    let sender: ConsoleTelemetrySender;
    let mockOutputChannel: { appendLine: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockOutputChannel = {
            appendLine: vi.fn(),
            dispose: vi.fn(),
        };
        sender = new ConsoleTelemetrySender(mockOutputChannel as any);
    });

    it("sendEventData writes to output channel", () => {
        sender.sendEventData("testEvent", { key: "value" });
        expect(mockOutputChannel.appendLine).toHaveBeenCalledOnce();
        const output = mockOutputChannel.appendLine.mock.calls[0][0] as string;
        expect(output).toContain("EVENT: testEvent");
        expect(output).toContain('"key":"value"');
    });

    it("sendEventData works without data", () => {
        sender.sendEventData("testEvent");
        expect(mockOutputChannel.appendLine).toHaveBeenCalledOnce();
        const output = mockOutputChannel.appendLine.mock.calls[0][0] as string;
        expect(output).toContain("EVENT: testEvent");
    });

    it("sendErrorData writes to output channel", () => {
        sender.sendErrorData(new Error("test error"), { context: "testing" });
        expect(mockOutputChannel.appendLine).toHaveBeenCalledOnce();
        const output = mockOutputChannel.appendLine.mock.calls[0][0] as string;
        expect(output).toContain("ERROR: test error");
        expect(output).toContain('"context":"testing"');
    });

    it("sendErrorData works without data", () => {
        sender.sendErrorData(new Error("test error"));
        expect(mockOutputChannel.appendLine).toHaveBeenCalledOnce();
        const output = mockOutputChannel.appendLine.mock.calls[0][0] as string;
        expect(output).toContain("ERROR: test error");
    });

    it("flush does not throw", () => {
        expect(() => sender.flush()).not.toThrow();
    });

    it("dispose does not throw", () => {
        expect(() => sender.dispose()).not.toThrow();
    });
});

describe("createTelemetry", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns reporter when connection string and factory are provided", () => {
        const mockReporter = { dispose: vi.fn() };
        const factory = vi.fn(() => mockReporter);
        const context = { subscriptions: [] } as any;

        const result = createTelemetry({ context, connectionString: "InstrumentationKey=test", createReporter: factory });

        expect(factory).toHaveBeenCalledWith("InstrumentationKey=test");
        expect(result).toBe(mockReporter);
        expect(context.subscriptions).toContain(mockReporter);
    });

    it("returns TelemetryLogger when no connection string is provided", async () => {
        const vscode = await import("vscode");
        const context = { subscriptions: [] } as any;

        const result = createTelemetry({ context });

        expect(vscode.env.createTelemetryLogger).toHaveBeenCalled();
        expect(result).toBeDefined();
        expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it("returns TelemetryLogger when connection string is provided but no factory", async () => {
        const vscode = await import("vscode");
        const context = { subscriptions: [] } as any;

        const result = createTelemetry({ context, connectionString: "InstrumentationKey=test" });

        expect(vscode.env.createTelemetryLogger).toHaveBeenCalled();
        expect(result).toBeDefined();
    });
});
```

---

### `tests/e2e-tests/tsconfig.json`

```json
{
    "compilerOptions": {
        "module": "commonjs",
        "target": "ES2022",
        "lib": ["ES2022"],
        "strict": true,
        "outDir": "../../src/dist/test/e2e-tests",
        "rootDir": ".",
        "sourceMap": true,
        "skipLibCheck": true,
        "moduleResolution": "node",
        "esModuleInterop": true,
        "types": ["mocha", "node"]
    },
    "include": ["./**/*.ts"]
}
```

---

### `tests/e2e-tests/extension.test.ts`

```ts
import * as assert from "assert";
import * as vscode from "vscode";

// E2E tests run inside a real Extension Host — use the real vscode API, not mocks.
suite("Extension Lifecycle", () => {
    test("extension is present", () => {
        const ext = vscode.extensions.getExtension("<publisher>.<extensionName-lowercase>");
        assert.ok(ext, "Extension should be installed");
    });

    test("extension activates", async () => {
        const ext = vscode.extensions.getExtension("<publisher>.<extensionName-lowercase>");
        assert.ok(ext, "Extension should be installed");
        await ext.activate();
        assert.strictEqual(ext.isActive, true, "Extension should be active after activation");
    });

    test("commands are registered", async () => {
        const commands = await vscode.commands.getCommands(true);
        /* Verify each scaffolded command is registered.
           Adapt assertions below to match the actual commands:
           assert.ok(commands.includes("<commandPrefix>.<id>"), "<commandPrefix>.<id> should be registered"); */
    });
});
```

**Rules**:
- Replace `<publisher>.<extensionName-lowercase>` with the actual extension ID.
- Add one `assert.ok(commands.includes(...))` assertion per scaffolded command.

---

### `tests/e2e-tests/helpers.ts`

```ts
import * as vscode from "vscode";

// Shared utilities for E2E tests — workspace access and file operations
// that are common across integration test suites.

/** Returns the first open workspace folder, or throws if none is open. */
export function getWorkspaceFolder(): vscode.WorkspaceFolder {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        throw new Error("No workspace folder open");
    }
    return folders[0];
}

export async function uriExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

export async function writeTextFile(uri: vscode.Uri, content: string): Promise<void> {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf-8"));
}
```

---

### `tests/e2e-tests/fixtures/empty-workspace/.gitkeep`

Empty file — the integration runner opens this as the VS Code workspace.

---

### `publish/.gitkeep`

Empty file — VSIX package artifacts are output here.

---

### `docs/dev/tsg/.gitkeep`

Empty file — placeholder for troubleshooting guides.

---

### `docs/dev/info/vscode-extension-lifecycle.md`

```md
# VS Code Extension Lifecycle

A concise reference for how VS Code extensions are loaded, activated, and deactivated.

## Extension Host Process

Extensions run in a separate **Extension Host** process, isolated from the main VS Code UI process. This ensures:

- A misbehaving extension cannot crash VS Code.
- Extensions can be activated and deactivated independently.
- Remote workspaces can run extensions in a different environment.

## Lifecycle Flow

```
VS Code starts
  └─→ Reads package.json manifests for all installed extensions
       └─→ Activation event fires (e.g., onStartupFinished, onCommand, onLanguage)
            └─→ Extension Host loads the module specified by "main" in package.json
                 └─→ Calls activate(context: ExtensionContext)
                      └─→ Extension is running (commands, providers, watchers active)
                           └─→ VS Code shuts down or extension is disabled
                                └─→ Calls deactivate()
```

## Activation Events

Declared in `package.json` under `activationEvents`. Common triggers:

| Event | When it fires |
|---|---|
| `onStartupFinished` | After VS Code finishes startup (does not slow startup) |
| `onCommand:<id>` | When the specified command is invoked |
| `onLanguage:<lang>` | When a file of the specified language is opened |
| `onView:<id>` | When the specified view is expanded in the sidebar |
| `workspaceContains:<glob>` | When the workspace contains a matching file |
| `*` | On VS Code startup (avoid — delays startup) |

**Implicit activation** (since VS Code 1.74.0): If your extension declares contribution points (commands, views, etc.) in `package.json`, VS Code can activate it automatically when those contributions are invoked — without explicit `activationEvents` entries.

## activate(context)

Called once when the extension is first activated. Receives an `ExtensionContext` with:

- **`subscriptions`**: Push disposables here; VS Code disposes them on deactivation.
- **`extensionPath`**: Absolute path to the extension directory.
- **`storageUri`** / **`globalStorageUri`**: Persistent storage locations.
- **`secrets`**: Secure credential storage.

**Subscriptions pattern** — register commands, providers, and watchers by pushing to `context.subscriptions`:

```ts
context.subscriptions.push(
    vscode.commands.registerCommand("myExt.doThing", handler),
    vscode.languages.registerHoverProvider("typescript", hoverProvider),
    vscode.workspace.onDidChangeConfiguration(onConfigChange)
);
```

## deactivate()

Called when VS Code shuts down or the extension is disabled/uninstalled.

- Return `void` for synchronous cleanup, or a `Promise` for async cleanup.
- All disposables pushed to `context.subscriptions` are disposed automatically.
- Use this for resources not tracked by subscriptions (open connections, timers, etc.).

## package.json Manifest

Key fields that drive the lifecycle:

| Field | Purpose |
|---|---|
| `main` | Entry point JS file (e.g., `./dist/extension.js`) |
| `engines.vscode` | Minimum VS Code version required |
| `activationEvents` | When to activate the extension |
| `contributes` | Static declarations: commands, views, settings, keybindings |

## Lazy Loading

Extensions are **not loaded at startup** by default. They are loaded only when their activation event fires. This keeps VS Code fast — only the extensions relevant to the current task are running.
```

---

### `CHANGELOG.md`

```markdown
# Changelog

## 0.0.1

- Initial release.
```

---

### `README.md`

```markdown
# <displayName>

<description>

## Commands

| Command | Description |
|---------|-------------|
<!-- one row per command -->
```

---

## View Containers & Icons

If the scaffolded extension includes `contributes.viewsContainers` in `package.json`:

- The `icon` property **must** be a relative path to an SVG file (e.g., `"media/icon.svg"`), **not** a codicon reference like `"$(book)"`.
- Codicon references (`$(name)`) are only valid for command icons and inline actions, **not** for Activity Bar view container icons.
- Create a simple SVG icon file at the specified path (e.g., `media/icon.svg`).

---

## Post-Scaffold Steps

After creating all files:

```bash
# 1. Install dependencies
cd src
npm install

# 2. Build (verify TypeScript compiles)
npm run build

# 3. Run unit tests (no VS Code needed)
npm test

# 4. Run unit tests with coverage
npm run test:coverage

# 5. Run integration tests (launches VS Code)
npm run test:integration

# 6. Package (creates VSIX in publish/)
npm run package
```

### Launching in VS Code

Open the extension folder in VS Code, then press **F5** to launch the Extension Development Host.
The `.vscode/launch.json` and `.vscode/tasks.json` files are already scaffolded.

### npm scripts ↔ .vscode tasks ↔ skills alignment

| npm script          | .vscode task              | Skill   | Purpose                            |
|---------------------|---------------------------|---------|------------------------------------|
| `build`             | `npm: build`              | build   | esbuild → dist/extension.js       |
| `test`              | `npm: test`               | test    | vitest run (unit tests)            |
| `test:coverage`     | `npm: test:coverage`      | test    | vitest run --coverage              |
| `pretest:integration` | `npm: pretest:integration` | —    | build + compile e2e tests          |
| `test:integration`  | `npm: test:integration`   | test    | vscode-test (e2e in Extension Host)|
| `package`           | `npm: package`            | publish | vsce package → publish/            |
