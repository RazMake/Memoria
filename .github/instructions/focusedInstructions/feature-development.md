# Feature Development Patterns

## Feature Architecture

Memoria features follow a consistent lifecycle pattern managed by `FeatureManager`:

1. **Registration**: In `extension.ts`, each feature registers a callback with `featureManager.register(featureId, callback)`.
2. **Toggle**: When the user toggles features via `Memoria: Manage Features`, the manager reads `.memoria/features.json` and calls each registered callback with `(root, enabled)`.
3. **Enable/Disable**: The callback activates or deactivates the feature (register providers, start watchers, etc.).

### Module Split Pattern

Each feature should separate **pure modules** (no `vscode` dependency) from **VS Code modules**:

| Module Type | Dependencies | Testability | Examples |
|---|---|---|---|
| Pure | None (or Node.js built-ins only) | Unit-testable without mocks | `taskParser.ts`, `contactParser.ts`, `pathRewriter.ts`, `collectorFormatter.ts` |
| VS Code | `vscode` API, `ManifestManager`, etc. | Requires `vi.mock("vscode")` | `taskCollectorFeature.ts`, `contactsFeature.ts`, `todoEditorProvider.ts` |

**Guideline**: Push as much logic as possible into pure modules. The VS Code module should be a thin orchestrator that wires dependencies, registers providers, and dispatches to pure functions.

### Reference: Task Collector Module Decomposition

The `taskCollector/` feature demonstrates the ideal pattern with 12 focused modules:

```text
taskCollector/
  ├── taskCollectorFeature.ts  — VS Code: lifecycle, watchers, sync orchestration
  ├── syncQueue.ts             — Pure: debounced job queue
  ├── taskParser.ts            — Pure: markdown task parsing
  ├── taskIndex.ts             — Pure: stable task identity management
  ├── taskAlignment.ts         — Pure: Myers-diff alignment for task matching
  ├── pathRewriter.ts          — Pure: relative path rewriting for moved tasks
  ├── taskWriter.ts            — Pure: line-range replacement in source files
  ├── pendingWrites.ts         — Pure: self-write suppression tracking
  ├── renameHandler.ts         — VS Code: file rename event handling
  ├── aging.ts                 — Pure: completed-task pruning by age
  ├── collectorFormatter.ts    — Pure: render collector document from index
  └── types.ts                 — Shared type contracts
```

## Blueprint Integration

Features are declared in `blueprint.yaml` under the `features:` key. The `blueprintParser.ts` `parseFeatures()` function validates feature-specific config. When adding a new feature:

1. Add a new case to the `parseFeatures()` switch statement in `blueprintParser.ts`
2. Add the feature type to the `BlueprintFeature` discriminated union in `blueprints/types.ts`
3. Register the feature callback in `extension.ts`
4. Gate the feature behind `.memoria/features.json` toggle

## Command Patterns

Commands use **factory functions** (not classes) that receive dependencies:

```typescript
export function createMyCommand(
    dependency1: Dep1,
    dependency2: Dep2,
): () => Promise<void> {
    return async () => {
        // command logic
    };
}
```

Sidebar invocations pass context directly (e.g., `{ contactId }`). Command palette invocations use QuickPick as fallback for selection.

## Webview Features

Webview-backed features (contacts sidebar, todo editor) follow this pattern:

1. **Provider** (`*ViewProvider.ts` or `*EditorProvider.ts`): Manages HTML shell, CSP, message routing
2. **Feature** (`*Feature.ts`): Owns data loading, mutations, business logic
3. **Webview JS** (`webview/main.ts`): Browser-side UI, bundled separately

**Key rule**: Push expensive parsing/resolution into the feature layer. The provider should only map snapshots to webview messages.
