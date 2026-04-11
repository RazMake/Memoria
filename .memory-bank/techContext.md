# Tech Context — Memoria

## Tech Stack
- **Language**: TypeScript 5.8, strict mode, target ES2022
- **Runtime**: Node.js 20 (VS Code extension host)
- **Bundler**: esbuild (CJS output, externals: `vscode`, `@vscode/extension-telemetry`)
- **Framework**: VS Code Extension API (^1.100.0)

## Dependencies
| Package | Purpose |
|---------|---------|
| `@vscode/extension-telemetry` | Production telemetry (lazy-loaded via require) |
| `yaml` | YAML parsing for blueprint definitions |

## Dev Dependencies
| Package | Purpose |
|---------|---------|
| `vitest` + `@vitest/coverage-istanbul` | Unit tests + coverage |
| `@vscode/test-cli` + `@vscode/test-electron` | E2E tests in Extension Host |
| `mocha` + `@types/mocha` | E2E test framework (Mocha TDD) |
| `esbuild` | Bundling |
| `typescript` | Compilation |
| `@vscode/vsce` | Extension packaging |

## Build & Test Commands (all from `src/`)
| Command | What it does |
|---------|--------------|
| `npm run build` | Bundle via esbuild → `dist/extension.js` |
| `npm test` | Unit tests (vitest run) |
| `npm run test:coverage` | Unit tests with Istanbul coverage (85% thresholds) |
| `npm run test:integration` | E2E tests in Extension Host |
| `npm run test:coverage:all` | Unit + E2E coverage combined |
| `npm run package` | Package VSIX to `publish/` |

## Test Architecture (Dual-Suite)
- **Unit tests** (`tests/unit-tests/`): Vitest, runs in Node.js, mocks `vscode` module entirely. Folder structure mirrors `src/`. < 100ms per test.
- **E2E tests** (`tests/e2e-tests/`): Mocha TDD, runs in real Extension Host via `@vscode/test-cli`. 15s timeout. Tests real vscode API.
- **Coverage**: Istanbul provider, 85% thresholds (statements, branches, functions, lines). `extension.ts` and `types.ts` excluded from coverage.

## Known Issues / Gotchas

### Istanbul Coverage on Windows
- **0% coverage bug**: Vite uses `/F:/...` POSIX paths on Windows. `test-exclude` with `relativePath: true` produces broken relative paths that never match. **Fix**: `allowExternal: true` in coverage config.
- **Crash on interface-only files**: `@vitest/coverage-istanbul@3.2.4` crashes on `getCoverageMapForUncoveredFiles()` for files with no instrumentable code. **Fix**: Exclude `**/types.ts` + patched `node_modules` provider.

### Stale `.js` Files
Manual `tsc` runs can create `.js`/`.js.map` files in `src/blueprints/` and `src/commands/` that cause "Cannot find module 'vscode'" errors in Vitest. Delete them if tests fail with that error.

## Project Layout
```
src/                    — Extension source (entry: extension.ts)
  blueprints/           — Blueprint subsystem (parser, registry, engine, scaffold, manifest, resolver)
  commands/             — Command handler factories
  resources/blueprints/ — Bundled blueprint YAML + seed files
tests/
  unit-tests/           — Vitest unit tests (mirror src/ structure)
  e2e-tests/            — Mocha E2E tests (Extension Host)
docs/
  adrs/                 — Architecture Decision Records
  dev/specs/            — Feature specs and implementation plans
  dev/tsg/              — Troubleshooting guides (empty)
.memory-bank/           — Memory bank (this directory)
.github/instructions/   — Copilot coding instructions
```
