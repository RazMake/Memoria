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

- **ALT-003**: **Description**: Drive VS Code’s UI for end-to-end workflows (QuickPick, input boxes, webviews).
- **ALT-004**: **Rejection Reason**: Slow and flaky with higher setup/maintenance costs; rejected as primary infrastructure (may be considered later for truly UI-critical workflows only).

### Unit tests only (mocked vscode)

- **ALT-005**: **Description**: Rely exclusively on unit tests with mocked vscode APIs.
- **ALT-006**: **Rejection Reason**: Cannot validate activation/packaging/host wiring and misses real Extension Host regressions.

## Implementation Notes

- **IMP-001**: Add dev dependencies: @vscode/test-cli and @vscode/test-electron.
- **IMP-002**: Add a .vscode-test.* configuration file defining compiled test file globs, VS Code version/quality (default stable), workspace fixture to open, Mocha defaults (UI/timeout), and launch args (for example, --disable-extensions) for isolation.
- **IMP-003**: Keep a dedicated TypeScript compile step for integration tests.
- **IMP-004**: Update npm scripts so integration tests run via vscode-test (after build + test compilation).
- **IMP-005**: Ensure there’s a debug workflow for integration tests (via VS Code’s test runner integration or an extensionHost launch configuration).

## References

- **REF-001**: @vscode/test-cli — https://www.npmjs.com/package/@vscode/test-cli
- **REF-002**: @vscode/test-electron — https://www.npmjs.com/package/@vscode/test-electron
- **REF-003**: VS Code extension testing — https://code.visualstudio.com/api/working-with-extensions/testing-extension
