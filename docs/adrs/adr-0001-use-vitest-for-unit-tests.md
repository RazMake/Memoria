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
