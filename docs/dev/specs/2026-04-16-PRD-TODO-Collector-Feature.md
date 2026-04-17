# PRD: Task Collector & Sync Feature

**Date**: 2026-04-16
**Status**: Draft

## 1. TL;DR
Add a new Memoria feature — **Task Collector** — that aggregates every Markdown task (`- [ ] …`) across all workspace roots into a single collector file (e.g. `00-Tasks/All-Tasks.md`), keeps it in two-way sync with the source files, moves completed tasks to a `# Completed` section with a completion date, and ages them out after a configurable window (default 7 days). Shipped in both blueprints, enabled by default, with a "Sync now" command and an optional async startup sync.

Task bodies are captured and rendered with **full Markdown fidelity** — inline formatting (bold/italic/code/strike), links, images, inline HTML, fenced code blocks, tables, and nested sub-bullets are all preserved verbatim in the collector. Relative image/link paths are rewritten on render so the collector displays correctly, and reverse-rewritten on collector→source propagation.

The core design challenge is reliable two-way sync. We propose a **single-writer reconciler with a serialized work queue, a sidecar identity index (no in-body markers in source files), fingerprint + positional alignment for rename-safe matching, self-write suppression, and always-WorkspaceEdit writes** — an approach that is demonstrably race-free rather than "best effort".

---

## 2. Goals / Non-goals

**Goals**
- Collect every `- [ ] / - [x]` in workspace Markdown into a single collector file.
- Bi-directional sync on every MD file change (source ↔ collector).
- Allow manual task entry in the collector (no source).
- Move completed tasks to a `# Completed` section, record the completion date.
- Prune completed entries older than a configurable retention (default 7 days). When pruned, the originating source line is rewritten to `- **Done**: <body>` so it is no longer a task and never re-ingested (see §4.9).
- When completion originates in the collector, propagate the `[x]` + completion date back to the source file.
- **Preserve the original Markdown syntax of task bodies verbatim** in the collector — including inline formatting (bold/italic/code/strike), inline/reference-style links, images, inline HTML, fenced code blocks, tables, and nested sub-bullets.
- **Rewrite relative image/link paths** on render (source-dir-relative → collector-dir-relative) so images and links resolve correctly in the collector; reverse-rewrite on collector→source propagation.
- Command `Memoria: Sync Tasks` for a full workspace sync.
- Optional async sync on startup (enabled by default, non-blocking).
- Multi-root safe.

**Non-goals**
- Task prioritization, due dates, tags (beyond recording completion date).
- Nested task hierarchy beyond what vanilla GFM tasks already express (indented children handled structurally but not re-ordered).
- Syncing non-Markdown files.
- Replacing external todo tools (Todoist, Jira).

---

## 3. User-visible behavior

- Feature ID: `taskCollector`. Appears in `Memoria: Manage Features`; enable/disable is authoritative via `features.json` (single source of truth for on/off).
- New command: `memoria.syncTasks` (palette title: *Memoria: Sync Tasks*).
- The **collector file path is owned by the blueprint**, not by user config. Each blueprint's `taskCollector` feature entry declares `collectorPath` (e.g. `00-Tasks/All-Tasks.md`); the path is materialized into the workspace at init time and is not re-configurable post-init via `task-collector.json`. Re-init with a different blueprint is the supported path to change it (handled by the existing conflict resolver).
- Per-workspace runtime config lives in `.memoria/task-collector.json` (consistent with `decorations.json`, `default-files.json`, etc.) — NOT in VS Code `contributes.configuration`. Schema:
  ```json
  {
    "completedRetentionDays": 7,
    "syncOnStartup": true,
    "include": ["**/*.md"],
    "exclude": ["**/node_modules/**", "**/.git/**", "**/.memoria/**"],
    "debounceMs": 1000
  }
  ```
- The resolved `collectorPath` is read from the blueprint manifest (persisted in `.memoria/`) at engine startup and cached on the in-memory `TaskIndex`. It is NOT duplicated into `task-collector.json`.
- **Hard-coded exclusions** (always applied, not user-configurable): `**/WorkspaceInitializationBackups/**` and the collector file itself (resolved from the blueprint). These are engine-owned storage and must never be ingested.
- Defaults seeded by each blueprint's `taskCollector` feature entry (`enabledByDefault: true`, `collectorPath` per blueprint, plus the runtime defaults above).

---

## 4. Algorithm — Sync Engine

The design treats the filesystem as the source of truth and maintains an in-memory **TaskIndex** as a cache that is reconciled against disk. All mutations go through a single async queue.

### 4.1 Task grammar (multi-line)

A **task block** is: a task line plus any number of continuation lines that belong to it.

- **Task line**: `<indent>- [ ] <text>` or `<indent>- [x] <text>` (also `[X]`).
- **Hanging indent**: the task line's `<indent>` plus the width of the bullet marker `"- [x] "` = **6 columns** past `<indent>`. Call this `HANG = indent + 6`.
- **Continuation line**: any line that is
  - non-empty and indented ≥ `HANG`, OR
  - a blank line immediately followed by another continuation line (blank lines between continuations are absorbed).
- **Terminators** (NOT part of the block): next list item at indent ≤ task indent, heading (`#`), horizontal rule, fenced code block start at shallower indent, a non-blank line at indent < `HANG`, or EOF.
- A trailing run of blank lines after the last continuation is dropped from the block body.

Worked example (columns shown; `·` = space):

```
- [ ] simple task
- [ ] multi line task
······with additional lines below    ← 6 spaces, matches HANG
- [ ] even tasks with
······multi line and
                                     ← blank between continuations: absorbed
······empty lines inside
```

Lines indented with 3 spaces (like older Markdown examples) would be treated as a *sibling paragraph*, not a continuation. This is GFM-correct.

The parser emits `TaskBlock { indent, checked, firstLineText, continuationLines[], bodyRange: {startLine, endLine} }`.

**Body content — arbitrary Markdown.** The `firstLineText` and each `continuationLines[]` entry carry raw Markdown bytes; the parser does not tokenize or validate the inline content. The following constructs are explicitly in-scope for verbatim preservation when they appear inside the task block (i.e. on the task line or on continuation lines indented ≥ `HANG`):

- **Inline formatting**: `**bold**`, `*italic*` / `_italic_`, `` `code` ``, `~~strike~~`.
- **Inline links**: `[text](url)` and reference-style `[text][id]` (the definition, if task-local, lives on a continuation line).
- **Images**: `![alt](path)` — both inline and reference-style.
- **Inline HTML**: e.g. `<sub>x</sub>`, `<kbd>Ctrl</kbd>`, `<br>`.
- **Fenced code blocks**: ```` ```lang ... ``` ```` — opened and closed on continuation lines at indent ≥ `HANG`. Lines inside a fence that begin at column < `HANG` are NOT treated as terminators while a fence is open; the fence-open state carries across the "blank line absorbed" rule.
- **Tables** (GFM pipe tables): header, separator, and body rows on continuation lines.
- **Nested sub-bullets**: `- child`, `* child`, `1. child` at indent ≥ `HANG` are continuation lines (part of the task body), not separate tasks — unless the child itself is a `- [ ]` / `- [x]`, in which case it is a *separate task* (its own block) and terminates the parent's body at its own line.

Worked example — every construct below belongs to a single task block because every continuation line is indented ≥ 6 columns:

~~~markdown
- [ ] Review **PRD** draft and ship `v1`
      See the diagram:

      ![architecture](./img/arch.png)

      Key points:
      - tolerate <kbd>Ctrl</kbd>+S autosave
      - bench against [baseline](../bench/README.md)

      ```ts
      const HANG = indent + 6;
      ```

      | metric | before | after |
      | ------ | ------ | ----- |
      | p50    | 120ms  | 45ms  |
~~~

### 4.2 Task identity — sidecar index, no in-body markers

**No markers are written into source Markdown files, ever.** Source files stay exactly as the user types them. Identity is maintained in a hidden sidecar:

`.memoria/tasks-index.json` (managed by `ManifestManager`)

```json
{
  "version": 1,
  "tasks": {
    "mem-ab12cd": {
      "source": "docs/notes.md",
      "sourceOrder": 3,
      "fingerprint": "sha256:9f…",
      "body": "Review **PRD** draft\n   with [link](./a.md)",
      "firstSeenAt": "2026-04-16T…",
      "completed": false,
      "doneDate": null,
      "collectorOwned": false
    }
  },
  "collectorOrder": {
    "active": ["mem-ab12cd", "mem-xx99yy"],
    "completed": ["mem-ef34gh"]
  },
  "sourceOrders": {
    "docs/notes.md": ["mem-ab12cd", "mem-zz77aa"]
  }
}
```

- `collectorOrder` is the authoritative "last-known layout" of the collector — used by §4.3 Pass 2 when aligning collector edits. Updated atomically with every collector write.
- `sourceOrders[path]` is the analogous last-known layout per source file. Used by §4.3 alignment on source reconcile.

**Fingerprint** = SHA-256 of the *normalized body bytes*:
- strip the leading list marker and checkbox
- dedent all lines by the task's indent
- strip trailing whitespace per line
- collapse any run of blank continuation lines to a single `\n`
- the checkbox state is NOT part of the fingerprint (so `[ ] → [x]` preserves identity)
- **Markdown syntax characters are part of the fingerprint.** `*foo*` and `**foo**` produce distinct fingerprints; changing `[text](a.md)` → `[text](b.md)` changes the fingerprint. Formatting-only edits are therefore treated as a reword, and identity is recovered via the §4.3 positional alignment (same mechanism as any other reword).

*Rationale:* Fingerprinting raw bytes avoids coupling the hot path to a Markdown renderer, keeps fingerprint computation O(n) in body length, and makes fingerprint behaviour trivially testable. The cost — that a pure-formatting edit looks like a reword — is fully absorbed by the alignment pass, which already handles rewords.

**ID assignment**: 6-hex-char random, collision-checked against the live index. IDs never appear in Markdown files, only in the sidecar.

### 4.3 Matching tasks across edits (rename-safe, reorder-safe)

On every reconcile of a source, we need to map parsed `TaskBlock[]` back to existing IDs. Pure fingerprint lookup fails when the user rewords a task. We solve this with a **Myers-style alignment over ordered fingerprint sequences**, scoped per source file:

1. `oldSeq` = index entries for this source, in their previously-recorded order.
2. `newSeq` = freshly parsed task blocks in document order.
3. Pass 1 — match by exact fingerprint (O(n), consumes both sides).
4. Pass 2 — for remaining unmatched pairs, run Myers LCS on *position signatures* `(prevTaskFingerprint, nextTaskFingerprint)` so surrounding context disambiguates reworded tasks from inserted/deleted ones.
5. Pass 3 — any still-unmatched old entry whose new neighbor (prev or next) matched keeps its ID by *positional inheritance* (treat as "reworded in place").
6. Anything left over:
   - unmatched old → **task deleted**, drop ID from index
   - unmatched new → **new task**, assign fresh ID
7. Update `body`, `fingerprint`, last-seen position.

This is the same technique git uses to detect line moves/renames and works well in practice.

### 4.4 Collector file format — also marker-free

Since the collector is owned by the reconciler, we render it deterministically from the index. **No `<!-- src -->` or `<!-- done -->` comments in the body.** Each task's source and completion date live in the sidecar; the collector presents them as a clean, human-readable suffix line that renders naturally in Markdown:

```markdown
# Active

- [ ] Write the PRD
- [ ] multi line task
   with additional lines below
- [ ] Manual task

# Completed

- [x] Ship build
   _Source: docs/ship.md · Completed 2026-04-14_
- [x] Review PRD
   _Completed 2026-04-14_
```

- The italic suffix is a **continuation line** under the task (honors the multi-line grammar above). It is written only for entries in `# Completed`.
- Parser is tolerant of user-hand-edited suffixes: the line is matched as a single italic run (`_…_` or `*…*`) containing any order/separator of `Source:\s*<path>` and `Completed\s*<YYYY-MM-DD>`. Extracted via named capture groups; unrecognized text in the suffix is preserved but ignored.
- Active tasks in the collector get no suffix — they are pure Markdown the user would type by hand.
- If the user deletes or edits the italic suffix in a way that the parser still recognizes, the parsed values are **authoritative** (e.g. user fixing a wrong date or re-binding a source). If the suffix becomes unparseable, the index values are kept and the suffix is re-rendered on next write.

When the user edits the collector, we recover identities by the same §4.3 alignment — using `collectorOrder` (active + completed sequences) from the index as the `oldSeq`. Because `collectorOrder` is refreshed atomically on every collector write, the alignment anchor is always fresh.

**Manual (collector-only) tasks**: index entry has `collectorOwned: true` and `source: null`. They render with no suffix while active, `_Completed YYYY-MM-DD_` when done.

#### 4.4.1 Body rendering & relative-path rewriting

Task bodies are rendered into the collector **verbatim** from the last parsed source text (stored in the index as `body`, see §4.8). The engine performs **no** Markdown re-serialization, normalization, or stripping — inline formatting, inline HTML, fenced code, tables, and nested sub-bullets round-trip byte-for-byte. The only transformation applied is relative-path rewriting for images and links, described below.

**Why rewrite paths.** A source file at `docs/notes.md` containing `![diagram](./img/arch.png)` means `docs/img/arch.png`. When the same line is rendered inside `00-Tasks/All-Tasks.md`, the relative reference resolves against `00-Tasks/`, which is wrong — Markdown previewers would show a broken image. The engine rewrites the path at render time so the image/link resolves identically from the collector's location.

**What gets rewritten.**

- Inline image: `![alt](path "optional title")`
- Inline link:  `[text](path "optional title")`
- Reference-style definition appearing as a continuation line inside the task block: `[id]: path "optional title"`

**What does NOT get rewritten** (string match on `path`):

- Absolute URLs with a scheme — `https://…`, `http://…`, `mailto:…`, `data:…`, `ftp:…`, etc. (recognized by `^[a-zA-Z][a-zA-Z0-9+\-.]*:`).
- Protocol-relative URLs — `//example.com/…`.
- Fragment-only — `#section`.
- Workspace-absolute paths starting with `/` — passed through unchanged (treated as deliberate by the user).
- Any link/image appearing **inside a fenced code block** within the task body — code fences are a verbatim context; paths there are content, not references.

**Rewrite algorithm (source → collector).** For each task block where `source` is set:

1. Tokenize the body with a conservative regex that captures `path` for inline images, inline links, and reference definitions. The tokenizer tracks fenced-code state and skips matches while a fence is open.
2. For each match whose `path` is a rewrite candidate (per the rules above): compute `newPath = path.posix.relative(dirname(collectorRelPath), path.posix.join(dirname(sourceRelPath), path))`, then splice `newPath` into the matched token.
3. Leave all surrounding Markdown untouched (no re-tokenization, no whitespace normalization).

**Reverse rewrite (collector → source).** See §4.8; mirrors the above using `dirname(sourceRelPath)` as the target base. If a path in the collector does not look like a rewrite of a known source-relative path (e.g. the user hand-typed a new `![](./local.png)` while editing the collector), it is written through to the source **verbatim** — standard Markdown path semantics apply from that point on, and the user is responsible for the reference.

**Rewriting is skipped** for tasks with `source: null` (manual / `collectorOwned`) and for entries in `# Completed` where aging has already purged the source binding (no reverse destination).

**Worked example.** Source `docs/deep/notes.md`:

```markdown
- [ ] Review diagram
      ![arch](./img/arch.png) — see [baseline](../bench/README.md)
      <https://example.com/spec> stays as-is.
```

Rendered into `00-Tasks/All-Tasks.md` (collector):

```markdown
- [ ] Review diagram
      ![arch](../docs/deep/img/arch.png) — see [baseline](../docs/bench/README.md)
      <https://example.com/spec> stays as-is.
```

The autolink to `example.com` is untouched (absolute URL); both relative paths are recomputed to resolve against the collector's directory.

**Fingerprint interaction.** Fingerprints (§4.2) are computed over the **source body** (pre-rewrite). The collector body is a *view* produced from the source body by the rewriter; the rewriter is deterministic and pure, so regenerating the collector from the index produces byte-identical output.

### 4.5 Reconciler: serialized work queue

A single `SyncQueue` owns all read/write operations. Every trigger — file change, command, startup — enqueues a job; jobs run strictly one-at-a-time.

```
jobs: FIFO queue of { kind: 'source'|'collector'|'full', uri?, timestamp }
```

- Rapid duplicate jobs for the same URI are coalesced via a **1000 ms** debounce before enqueue (configurable via `debounceMs` in `task-collector.json`; matches VS Code's default autosave delay).
- Queue is drained by a single async loop. No concurrent file I/O.
- If the queue is idle, it sleeps until signalled.

*Rationale:* Two-way sync with multiple watchers is the textbook setup for races. A serialized queue collapses the concurrency model to "one op at a time", eliminating interleaving races entirely. The cost is latency (hundreds of ms), which is acceptable for task sync.

### 4.6 Self-write suppression

Every write performed by the reconciler records the expected post-write content hash for the file in a `pendingWrites: Map<uri, Set<sha256>>`. The watcher callback consults this map:

1. Change event fires → read file → hash.
2. If hash is in `pendingWrites[uri]` → discard entry, **drop the event**.
3. Else → enqueue reconcile job.

Entries in `pendingWrites` that are not consumed within a bounded window (e.g. 5s) are evicted by a timer sweep, so a never-arriving watcher event cannot permanently shadow later real edits.

*Rationale:* Avoids the classic infinite feedback loop ("we write → watcher fires → we reconcile → we write again"). Using content hashes (not just a timer) handles the case where a user edit lands during our own write.

### 4.7 Writes: always `WorkspaceEdit`

All file mutations — source and collector — go through `vscode.WorkspaceEdit`. This works uniformly whether the target document is open+dirty, open+clean, or closed on disk. Raw `fs.writeFile` is never used for tracked files.

- Edit application uses `{ isRefactoring: false }` and checks the returned boolean. On `false` (stale view / conflict), the job re-reads the file and retries up to 3 times with exponential backoff, then surfaces an error toast and aborts this reconcile cycle (state stays consistent because the index is not persisted until the write succeeds).
- The engine never calls `TextDocument.save()` — it lets the user save when they want. Written content is persisted by VS Code's edit-flushing mechanism on close/save, and our authoritative store is always the index plus what's on disk at query time.

*Rationale:* Removes the open/closed branching, avoids clobbering dirty buffers, and lets VS Code do the text-range bookkeeping.

### 4.8 Per-job logic

**`reconcile(sourceUri)`**

1. Parse source Markdown → ordered `TaskBlock[]` (per §4.1). Each block's full raw body (task line + all continuation lines, verbatim, including Markdown syntax) is captured.
2. Align against `sourceOrders[path]` + per-source index entries (per §4.3).
3. For each aligned block, update the **in-memory** index:
   - New block → new `mem-id`.
   - Vanished ID → drop from index.
   - Fingerprint changed → update `fingerprint` + `body` (the authoritative verbatim body cache used by the collector renderer).
   - Checkbox `[ ] → [x]` → `completed = true`, `doneDate = today`. **Source is not modified** (the `[x]` is already there).
   - Checkbox `[x] → [ ]` → `completed = false`, clear `doneDate`.
4. Mark the collector as dirty (do NOT rewrite it yet — see batching below).
5. Persist `tasks-index.json`.

`reconcile(sourceUri)` is **read-only on the source file**. No source writes occur here.

**Collector write batching**: `reconcile(source)` never writes the collector. Instead, if any index change occurred, an idempotent `reconcile(collector, renderOnly: true)` job is appended to the queue (coalesced if one is already pending). `fullSync()` enqueues exactly one such render pass at the end. This eliminates N collector rewrites during bulk operations.

**`reconcile(collectorUri)`** (both user-edit reconcile and the render-only variant)

1. *(user-edit only)* Parse collector → `TaskBlock[]` split by `# Active` / `# Completed`; extract italic suffix continuation lines per §4.4 before fingerprinting.
2. *(user-edit only)* Align against `collectorOrder` + index entries (per §4.3).
3. For each aligned entry where the user edit diverges from the index:
   - If `source` is set, push changes to source via `WorkspaceEdit`:
     - Text edit → **reverse-rewrite relative image/link paths** in the edited body (collector-relative → source-relative, per §4.4.1), then replace the source task's body range with the result. Markdown formatting and all other body content round-trip verbatim.
     - `[ ] → [x]` → flip the source checkbox. Completion date lives only in the index/collector — **we do not write dates into source files**.
     - `[x] → [ ]` → flip back.
   - If `source` is null (manual), only update the index.
4. **Aging pass** — see §4.9.
5. Re-render collector body deterministically from index. Update `collectorOrder` atomically with the write. Persist `tasks-index.json`; apply the collector `WorkspaceEdit`.

**`fullSync()`**

1. Glob workspace for MD files (respecting include/exclude and hard-coded exclusions).
2. Enqueue one `reconcile(source)` per file.
3. Append one `reconcile(collector, renderOnly)` at the end.

### 4.9 Aging: completion → archive → source rewrite

When an entry in the index has `completed = true` and `doneDate` older than `completedRetentionDays`:

1. **If `collectorOwned` (manual task)**: drop from index; re-render collector without it. Done.
2. **If `source` is set**: the engine rewrites the source file's task line from `<indent>- [x] <body>` to `<indent>- **Done**: <body>` via `WorkspaceEdit`. The body's Markdown syntax (formatting, links, images, inline HTML) is preserved verbatim — no stripping — and continuation lines of the block remain under the (now non-task) bullet unchanged. No path rewriting is needed here: the paths were already source-relative in the source file and are not leaving it. The rewrite is guarded: the engine re-parses the source immediately before the edit and only proceeds if the block's current fingerprint still matches the index fingerprint. If it diverges (user has been editing), the rewrite is skipped this cycle and retried next reconcile. After a successful rewrite, the entry is dropped from the index.
3. `**Done**: ` is not task grammar (no `[ ]`/`[x]`), so subsequent source reconciles parse it as an ordinary list item and ignore it — it will never be re-ingested.
4. If the source file no longer contains the block (e.g. user deleted it), no rewrite is needed; just drop from the index.
5. If the source file is missing / unreadable, skip this entry and retry next cycle. A watchdog counter (e.g. 5 consecutive skips) escalates to an OutputChannel warning; the entry is dropped from the index to prevent it from blocking aging indefinitely (the source line, if it ever reappears, will be treated as a new task — acceptable trade-off).

**Aging is only triggered inside `reconcile(collectorUri)`** (both user-edit and render-only variants). That gives aging a natural debounce — it runs at most once per debounce window, which is ample.

### 4.10 File rename / move handling

Subscribe to `vscode.workspace.onDidRenameFiles`. On each rename:

1. For each `(oldUri, newUri)` pair where `oldUri` matches the include pattern:
   - Update every `index.tasks[*].source` from `oldRelPath` to `newRelPath`.
   - Update the key in `sourceOrders`.
2. Persist the index in one atomic write.
3. Enqueue a `reconcile(source)` for `newUri` to catch any content changes that happened during rename, and a trailing `reconcile(collector, renderOnly)` (so any `Source:` suffixes in `# Completed` reflect the new path).

No tasks are lost; IDs are preserved.

### 4.11 Cross-file cascades

After `reconcile(collectorUri)` writes to one or more source files, those writes are registered in `pendingWrites` so the watcher events they produce are dropped. No re-entry into `reconcile(source)` occurs for engine-driven writes. User edits that happen to produce the same bytes as an engine write are handled by the 5s eviction sweep in §4.6 — their subsequent edits (with different bytes) flow through normally.

### 4.12 Startup

On activation, if `syncOnStartup` is true and the feature is enabled:

```ts
queueMicrotask(() => void syncQueue.enqueue({ kind: 'full' }));
```

Activation returns immediately. Nothing awaits the result. Telemetry logs duration and outcome.

### 4.13 Feature disable / enable lifecycle

When `taskCollector` is toggled off via `Manage Features`:
- All `FileSystemWatcher`s and document event subscriptions registered by the feature are disposed.
- The queue drains any in-flight job and then halts; no new jobs are accepted.
- The collector file and `tasks-index.json` are preserved on disk unmodified.

When re-enabled:
- Watchers and queue are re-instantiated.
- A `fullSync()` is kicked off via microtask (same pattern as startup).

### 4.14 Workspace folder changes

Subscribe to `vscode.workspace.onDidChangeWorkspaceFolders`. Added roots contribute new watchers; removed roots have their watchers disposed and their per-source index entries dropped (a subsequent collector render prunes their tasks). The collector itself always lives in the initialized root.

### 4.15 Race condition scenarios — handled

| Scenario | Handling |
|---|---|
| Two MD files save simultaneously | Queue serializes; both reconciled in order. |
| User saves collector while reconciler is mid-flush | `WorkspaceEdit` returns `false` on stale view → re-enqueue with fresh read. |
| Reconciler write triggers own watcher | Hash in `pendingWrites` → event dropped; entries evicted after 5s. |
| User edits source during reconcile, completes same task in collector | Queue order decides; edits are line-scoped via `WorkspaceEdit`, so VS Code merges cleanly. |
| Dirty editor | Always `WorkspaceEdit` — no byte-level overwrite, ever. |
| Rapid-fire saves (autosave loop) | 1000 ms debounce collapses into one job. |
| Collector deleted by user | Next `reconcile(collector, renderOnly)` recreates it from index. |
| Source file renamed / moved | `onDidRenameFiles` handler rewrites the index; IDs preserved (§4.10). |
| Same task text in two files | Distinct IDs (alignment is per-source-file). |
| Same task text duplicated within one file | Alignment assigns IDs by position; both unique. |
| User manually copies a task between files | Appears as delete-here/new-there; two distinct IDs. Acceptable. |
| Aged-out completed task risks resurrection | Source `- [x]` rewritten to `- **Done**: …` before drop — not task grammar, won't be re-parsed (§4.9). |
| Index file corrupted or missing | First-run semantics with bootstrap recovery; sources untouched. See §4.16. |
| Workspace close mid-sync | Queue abandons in-flight; next startup's full sync reconciles from disk. |
| Workspace folder added / removed mid-session | `onDidChangeWorkspaceFolders` handler adjusts watchers + index (§4.14). |

### 4.16 Bootstrap / re-init recovery

Because identity lives only in `.memoria/tasks-index.json`, deleting the cache (first run, corruption, or the re-init conflict resolver) needs a deterministic recovery path. The content on disk is always sufficient to rebuild *most* bindings:

1. **Rebuild source index**: glob all MD files → parse → fingerprint every task → assign fresh `mem-id`s. Per-source indexes and `sourceOrders` are fully regenerated.
2. **Parse collector** (if present, including from the backup location — see below):
   - For each `# Completed` entry: the italic suffix (parsed tolerantly per §4.4) carries `Source` and `Completed` date. These are read authoritatively and restored to the index, whether or not the source still contains the task.
   - For each `# Active` entry: try exact fingerprint match against unclaimed source tasks.
     - Match → bind (`collectorOwned: false`, `source = matched`).
     - No match → mark `collectorOwned: true` (degrades to manual).
3. **Second-pass alignment against backup index** (only during re-init): the re-init conflict resolver backs up `.memoria/tasks-index.json` into `WorkspaceInitializationBackups/.memoria/`. If present, run the §4.3 alignment between the backup's `collectorOrder` + entries and the freshly parsed sources/collector. This recovers reworded active entries that bare-fingerprint matching missed.
4. Backup index is moved aside after bootstrap (rename to `tasks-index.backup-consumed.json`) so it isn't re-applied.

**Post-reinit auto-rescan**: at the end of a successful re-init, `memoria.initializeWorkspace` enqueues `queueMicrotask(() => void syncQueue.enqueue({ kind: 'full' }))`. The re-init command returns immediately — it does NOT await the sync. Same pattern as startup.

**Scope exclusions — hard-coded, never user-overridable**:
- `**/WorkspaceInitializationBackups/**` — but with a **single exception**: the bootstrap algorithm above reads `WorkspaceInitializationBackups/.memoria/tasks-index.json` and the backed-up collector file (if the collector itself was backed up during re-init) explicitly, once, during recovery. Normal discovery (`findFiles`, watchers) never sees inside this folder.
- The collector file itself — it is regenerated from the index, not parsed as a source.

**Consequences for the user**:
- Happy path (everything in sync before re-init): **zero entries become manual**.
- Edge case (active entry reworded in collector but not yet synced to source before re-init): recovered via backup second-pass alignment.
- Pathological case (no backup available AND active entries don't fingerprint-match any source): those entries become manual. Completed entries are always recoverable from the italic suffix.

**Re-init conflict resolver change**: extend `reinitConflictResolver` / `workspaceInitConflictResolver` to include `tasks-index.json` in the backup set written to `WorkspaceInitializationBackups/.memoria/`. The live file is still deleted — only the backup path is preserved — so the "cache-reset" semantic of re-init is maintained.

---

## 5. Architecture & code layout

- `src/features/taskCollector/` — new folder
  - `taskCollectorFeature.ts` — registers with `FeatureManager`, owns lifecycle (watchers, queue, document event subscriptions). Handles enable/disable cleanup (§4.13) and workspace folder changes (§4.14).
  - `syncQueue.ts` — serialized FIFO async queue with debounce + coalescing.
  - `taskParser.ts` — Markdown → `TaskBlock[]` per §4.1 grammar (captures verbatim body with all Markdown syntax intact, including fences and tables); also tolerant parser for the collector italic suffix line (§4.4).
  - `taskAlignment.ts` — §4.3 fingerprint + Myers alignment over ordered sequences.
  - `taskWriter.ts` — builds `WorkspaceEdit`s for source and collector mutations; retry loop on stale-edit rejection (§4.7). Invokes `pathRewriter.reverse` when propagating collector edits to source.
  - `taskIndex.ts` — in-memory mirror of `.memoria/tasks-index.json`: tasks map, `collectorOrder`, `sourceOrders`. Atomic persist via `ManifestManager`.
  - `pendingWrites.ts` — self-write suppression with 5s eviction sweep.
  - `collectorFormatter.ts` — deterministic rendering of `# Active` + `# Completed` from the index; renders task bodies verbatim and invokes `pathRewriter.forward` for relative image/link paths (§4.4.1).
  - `pathRewriter.ts` — fence-aware tokenizer for inline images, inline links, and reference definitions; exposes `forward(body, sourceRelPath, collectorRelPath)` and `reverse(body, collectorRelPath, sourceRelPath)`. Pure, no VS Code dependency.
  - `aging.ts` — §4.9 archive-and-rewrite: on purge, emits a `WorkspaceEdit` to convert `- [x] body` → `- **Done**: body` in the source (body preserved verbatim, no path rewriting), guarded by fingerprint match.
  - `renameHandler.ts` — §4.10 `onDidRenameFiles` subscription; rewrites index paths atomically.
  - `types.ts` — shared types.
- `src/commands/syncTasks.ts` — factory `createSyncTasksCommand(queue, telemetry)`.
- `src/extension.ts` — wire feature + command + startup kick.
- `src/package.json` — add `memoria.syncTasks` command contribution only (NO `contributes.configuration` — config lives in `.memoria/task-collector.json`).
- `src/blueprints/types.ts` / `blueprintParser.ts` — add `TaskCollectorFeature` variant. `collectorPath` is a **required** field on the blueprint feature entry (authoritative source). `completedRetentionDays`, `syncOnStartup`, `include`, `exclude`, `debounceMs` are optional blueprint-level defaults used only to seed `.memoria/task-collector.json` at init; parser materializes built-in defaults when omitted.
- `src/blueprints/blueprintEngine.ts` + `reinitConflictResolver.ts` + `workspaceInitConflictResolver.ts` — back up `.memoria/tasks-index.json` on re-init (§4.16).
- `src/commands/initializeWorkspace.ts` — post-reinit auto-rescan via microtask.
- `src/resources/blueprints/individual-contributor/blueprint.yaml` & `people-manager/blueprint.yaml` — add `taskCollector` feature with `enabledByDefault: true` and per-blueprint `collectorPath`.
- `src/resources/blueprints/*/files/00-Tasks/All-Tasks.md` — seed content (both blueprints).

---

## 6. Implementation phases

**Phase 1 — Parser, alignment, formatter (pure, no VS Code)**
1. `taskParser.ts` — parse `TaskBlock[]` per §4.1 with verbatim body capture (fence-aware; preserves inline HTML/tables/nested bullets); tolerant italic-suffix parser per §4.4.
2. `pathRewriter.ts` — forward + reverse relative-path rewriting for inline images, inline links, and reference definitions; fence-aware; pass-through for absolute URLs / schemes / fragments (§4.4.1).
3. `collectorFormatter.ts` — deterministic render from `TaskIndex`, invoking `pathRewriter.forward` for bound entries.
4. `taskAlignment.ts` — fingerprint hash (raw-body bytes) + Myers alignment (§4.3).
5. `taskIndex.ts` — in-memory index with `collectorOrder` / `sourceOrders`; JSON serialization.
6. Unit tests for 1–5 (Vitest; fully synchronous, no mocks). Includes fingerprint stability, alignment on reworded/reordered inputs, the §4.1 hanging-indent grammar, path-rewriter round-trip (`reverse ∘ forward = identity` for rewrite-candidate paths), and fence-aware skipping (links inside ```` ``` ```` are not rewritten).

**Phase 2 — Sync engine (single-root, happy path)**  *depends on Phase 1*

7. `syncQueue.ts` — enqueue / 1000 ms debounce / coalesce / drain loop.
8. `pendingWrites.ts` — hash suppression with 5s eviction sweep.
9. `taskWriter.ts` — `WorkspaceEdit`-only writes with retry (§4.7); invokes `pathRewriter.reverse` when propagating collector edits to source.
10. `taskCollectorFeature.ts` — register with `FeatureManager`; set up `FileSystemWatcher`s for include/exclude; collector watcher; document event subscriptions.
11. Per-job logic (`reconcile(source)`, `reconcile(collector)`, batched `renderOnly` collector pass, `fullSync`).
12. Unit tests for queue (ordering, debounce, coalescing) and writer (retry, stale-edit handling, collector→source reverse path rewrite, pass-through for hand-typed paths that don't match a known collector-rewrite form) via Vitest fake timers + mocked `vscode.workspace`.

**Phase 3 — Commands, config, startup**  *parallel with Phase 4*

13. `syncTasks.ts` command factory.
14. Register `memoria.syncTasks` in `package.json`.
15. Config loader reading `.memoria/task-collector.json` via `ManifestManager`, with defaults fallback.
16. Startup hook in `extension.ts` (microtask-scheduled).

**Phase 4 — Blueprint integration**  *parallel with Phase 3*

17. Extend `blueprints/types.ts` + `blueprintParser.ts` with `TaskCollectorFeature`.
18. Seed `All-Tasks.md` + `blueprint.yaml` entries in both blueprints.
19. E2E test: init blueprint → feature toggle present + enabled by default; collector file exists; config file exists with blueprint defaults.

**Phase 5 — Multi-root, aging, rename**  *depends on Phase 2*

20. Ensure globbing covers all roots; collector lives in the initialized root. Hook `onDidChangeWorkspaceFolders` (§4.14).
21. `aging.ts` with source-rewrite-to-**Done** (§4.9). Fingerprint-guarded.
22. `renameHandler.ts` — `onDidRenameFiles` wiring (§4.10).
23. E2E: complete a task in source → moves to `# Completed` with date; advance injected clock past retention → source line rewritten to `- **Done**: …`, index entry dropped, no resurrection on next `memoria.syncTasks`.
24. E2E: rename a source file → index paths updated, IDs preserved.

**Phase 6 — Re-init integration, hardening**  *depends on Phase 5*

25. Bootstrap recovery path (§4.16): parse collector (including from backup), fingerprint-match, optional backup second-pass alignment.
26. Extend `reinitConflictResolver` / `workspaceInitConflictResolver` to include `.memoria/tasks-index.json` in the backup set.
27. Wire post-reinit auto-rescan in `initializeWorkspace.ts` (non-blocking microtask).
28. Hard-code `**/WorkspaceInitializationBackups/**` + collector-file exclusion in the watcher/glob layer; add bootstrap-only carve-out for backup reads.
29. Telemetry usage events: `taskCollector.syncCompleted`, `taskCollector.startupSync`, `taskCollector.reinitRescan`, `taskCollector.bootstrapRecovery { mode: "exact" | "backup" | "degraded" }`, `taskCollector.agingPurged { count, avgAgeDays }`.
30. Telemetry error events: `taskCollector.reconcileFailed`, `taskCollector.bootstrapFailed`, `taskCollector.writeConflict`, `taskCollector.agingRewriteSkipped { reason }`.
31. Error toasts for unrecoverable write conflicts; OutputChannel log for startup/bootstrap failures (no toast).

---

## 7. Verification

**Automated (unit, Vitest)**
- Parser round-trip for all §4.1 task shapes (simple, multi-line with blank lines, hanging indent 6 cols, nested non-task children).
- Parser preserves fenced code blocks (with language tag) verbatim as continuation lines; a fence opened inside the task body is correctly tracked across blank lines and internally less-indented lines.
- Parser preserves GFM pipe tables, inline HTML (`<sub>x</sub>`, `<kbd>Ctrl</kbd>`), and nested sub-bullets as continuation lines without mutation.
- Italic-suffix parser: `Source:` and `Completed:` in both orders, different separators (`·`, `—`, `,`), extra whitespace, unrecognized trailing text preserved.
- Fingerprint stability: checkbox flip doesn't change fingerprint; indent changes don't change fingerprint; trailing whitespace variation doesn't change fingerprint.
- Fingerprint sensitivity to Markdown syntax: `*foo*` and `**foo**` produce **distinct** fingerprints; `[text](a.md)` and `[text](b.md)` produce distinct fingerprints. Alignment still re-binds them in place when surrounded by matched neighbours (§4.3).
- Alignment: reworded-in-place retains ID; pure reorder retains all IDs; insert + rewording keeps correct bindings.
- Path rewriter — forward: source `a/b/notes.md` with `![](./img/x.png)` renders in collector `00-Tasks/All-Tasks.md` as `![](../a/b/img/x.png)`; `[text](../sibling.md)` rewrites accordingly.
- Path rewriter — pass-through: absolute URLs (`https://…`, `http://…`), `mailto:`, `data:`, protocol-relative (`//cdn/…`), fragment-only (`#section`), and workspace-absolute (`/docs/x.md`) are NOT rewritten.
- Path rewriter — fence-aware: an `![](./img.png)` appearing inside a ```` ``` ```` fenced code block within the task body is NOT rewritten in either direction.
- Path rewriter — round-trip: `reverse(forward(path, src, col), col, src) === path` for every rewrite-candidate path.
- Path rewriter — reference definitions on continuation lines: `[id]: ./rel.md "title"` rewrites the path, preserves the title.
- Collector formatter: round-trip stability (re-emit is byte-identical when sources are unchanged); renders inline HTML / tables / fenced code / nested bullets verbatim aside from the documented path rewrites.
- Queue: FIFO order, 1000 ms debounce collapses bursts, coalescing drops duplicate pending URIs, `renderOnly` collector jobs coalesce.
- Reconcile diff: insert, remove, text-edit, `[ ]→[x]`, `[x]→[ ]`.
- Reconcile(collector) → source: edited image/link paths in the collector are **reverse-rewritten** before the source `WorkspaceEdit` is built; hand-typed paths that don't match a known collector-rewrite form pass through verbatim.
- Aging: entries older than retention cause source rewrite to `- **Done**: body` with body Markdown preserved verbatim; rewrite skipped when source fingerprint has drifted; manual (collectorOwned) entries dropped without source edit.
- Self-write suppression: synthesized watcher event with matching hash is dropped; unmatched hashes flow through; 5s eviction sweep removes stale entries.
- Rename: `onDidRenameFiles` synth event remaps `index.tasks[*].source` and `sourceOrders` keys atomically.

**Automated (E2E, @vscode/test-cli)**
- Init blueprint → `taskCollector` feature listed, enabled, collector file + `task-collector.json` present.
- Add `- [ ] foo` in a source → collector `# Active` gains entry; source remains byte-identical (no ID markers).
- Tick `[x]` in source → collector entry moves to `# Completed` with today's date in italic suffix; source still byte-identical apart from the user's `[x]`.
- Tick `[x]` in collector → source's `[ ]` flips to `[x]` (via `WorkspaceEdit`), exactly one source write registered (no watcher loop).
- Markdown fidelity: author a source task with inline `**bold**`, `` `code` ``, an inline HTML `<kbd>` span, a fenced code block, a pipe table, and a nested `- child` bullet → all constructs appear byte-identical (modulo path rewrites) in the collector; editing unrelated text in the collector and saving propagates back to source without mangling any of them.
- Image path rewrite: create `docs/deep/notes.md` with `- [ ] See ![x](./img/x.png)` and an actual image at `docs/deep/img/x.png`; after sync, the collector shows `![x](../docs/deep/img/x.png)` and a Markdown preview of the collector renders the image. Edit the alt text in the collector → source line becomes `- [ ] See ![new-alt](./img/x.png)` (path reverse-rewritten back to source-relative).
- Absolute/scheme URLs untouched end-to-end: a source task with `[site](https://example.com)` and `[abs](/docs/x.md)` appears identically in the collector.
- Aging with injected clock: complete a task, advance clock past `completedRetentionDays`, run `memoria.syncTasks` → source line becomes `- **Done**: body`, index entry gone, subsequent sync does NOT resurrect a task from the same line.
- Delete collector file → next `memoria.syncTasks` recreates it from index.
- Rename source file via `vscode.workspace.fs.rename` → `# Completed` suffixes show new path; no tasks become manual.
- Multi-root: tasks from both roots appear in the initialized root's collector with correct `Source:` paths in `# Completed`.
- Re-init flow: populate collector + index, re-init with a different blueprint → `WorkspaceInitializationBackups/.memoria/tasks-index.json` is present, re-init command's promise resolves *before* rescan completes; after rescan, bindings intact, zero entries demoted to manual.
- Backup folder ignored for discovery: place `WorkspaceInitializationBackups/foo.md` with tasks → `memoria.syncTasks` does not ingest them; watcher on that path does not fire reconciles.
- Feature toggle off → watchers disposed, collector + index preserved; toggle on → fullSync kicks in.

**Manual**
- Open collector and a source in side-by-side editors; edit both simultaneously; verify `WorkspaceEdit` merging preserves both users' intents.
- Rapid-save loop on a source file — verify one reconcile per debounce window, no disk thrash.
- Autosave with `afterDelay` at default 1000 ms — confirm sync still batches correctly.
- Visual: open the collector in VS Code's Markdown preview; confirm that images from deeply-nested sources render correctly (i.e. relative-path rewriting produced valid URLs from the collector's perspective).

---

## 8. Decisions

- **No in-body markers** anywhere. Identity lives in `.memoria/tasks-index.json` keyed by a 6-hex `mem-id`. Sources stay byte-for-byte as the user writes them (except for the controlled archive rewrite in §4.9).
- **Matching across edits**: fingerprint (normalized body SHA-256) + Myers-style positional alignment against `collectorOrder` / `sourceOrders`. Rename-safe, reorder-tolerant, reword-tolerant.
- **Multi-line task grammar** (§4.1): continuation lines indented ≥ 6 columns past the task's own indent; blank lines between continuations are absorbed.
- **`reconcile(source)` is read-only on the source file.** Source writes occur only from: (a) propagating a user edit *from* the collector, or (b) the archive-on-aging rewrite in §4.9.
- **Aging rewrites the source line** from `- [x] body` to `- **Done**: body` before dropping the index entry. This prevents resurrection by removing the line from task grammar. Fingerprint-guarded; skipped if the source block has changed since completion.
- **Completion dates**: stored in the index and shown in the collector's `# Completed` as an italic suffix continuation line. Not written into source files.
- **Markdown bodies preserved verbatim**: inline formatting, links, images, inline HTML, fenced code blocks, tables, and nested sub-bullets round-trip byte-for-byte between source and collector (modulo the documented path rewrites). The engine never re-serializes or normalizes Markdown.
- **Relative path rewriting**: inline images, inline links, and reference-style definitions with relative paths are rewritten on render (source-dir-relative → collector-dir-relative) and reverse-rewritten on collector→source propagation. Absolute URLs, schemes (`https:`, `mailto:`, `data:`), protocol-relative, fragment-only, and workspace-absolute paths pass through unchanged. Rewriting is fence-aware (skipped inside fenced code blocks).
- **Fingerprint is over raw body bytes**, including Markdown syntax characters. Formatting-only edits appear as rewords and are re-bound by positional alignment (§4.3), not normalized away.
- **Source of truth**: filesystem + index. Disk is authoritative; index is the "last known layout" + binding ledger.
- **Serialization model**: single async queue with 1000 ms debounce (matches VS Code autosave default).
- **Writes**: always `vscode.WorkspaceEdit`, never raw `fs.writeFile`. Works uniformly open/closed/dirty.
- **Completed retention default**: 7 days, configurable via `.memoria/task-collector.json`.
- **Settings storage**: per-workspace `.memoria/task-collector.json` (consistent with other Memoria features) for runtime knobs only. Feature on/off lives in `features.json` only — single source of truth. **`collectorPath` is owned by the blueprint**, not by `task-collector.json`; changing it requires re-init with a different blueprint.
- **Scope**: `**/*.md` by default; configurable. Hard-coded non-overridable exclusions: `**/WorkspaceInitializationBackups/**` and the collector file itself.
- **Rename handling**: `onDidRenameFiles` subscription rewrites index atomically; IDs preserved.
- **Feature toggle off**: watchers/queue disposed; collector + index preserved on disk.

---

## 9. Further Considerations (open — need owner input)

1. **Collector file location** — one file in the initialized root, or one-per-root in multi-root workspaces? Recommend: **single file in the initialized root**.
2. **Collector `# Completed` suffix format** — italic continuation line (`_Source: … · Completed 2026-04-14_`) vs. a separate metadata table vs. nothing-at-all (info only in sidecar). Recommend: **italic continuation line** — legible, round-trippable, renders cleanly.
3. **Active tasks in collector show source?** Recommend: **hide while active** (avoids clutter).
4. **Deletion semantics** — if a tracked task disappears from its source, remove from collector or move to Completed? Recommend: **silently remove** (deletion ≠ completion).
5. **Manual-task → source promotion** — if a user hand-writes a line in a source that fingerprint-matches a `collectorOwned` task, auto-bind? Recommend: **yes**.
6. **Startup failure UX** — toast on failed startup sync, or OutputChannel log only? Recommend: **OutputChannel only**.
7. **Index file location** — `.memoria/tasks-index.json` (hidden, gitignored) vs. committing it. Recommend: **keep in `.memoria/`** — it's cache, not authored content.
8. **Archive rewrite format** — `- **Done**: body` is clean Markdown. Alternatives: `- ~~body~~` (strikethrough), `- ✓ body`, or `- [done] body`. Recommend: **`- **Done**: body`** — most visible, self-explanatory, doesn't rely on emoji or GFM-only strikethrough.
9. **Cross-block reference-style link definitions** — a task body that references `[label][id]` where `[id]: …` is defined *outside* the task block (elsewhere in the source file). The collector renders the reference inline; without the external definition, the label renders as a literal. **Out of scope** to hoist such definitions into the collector. Recommend: document the limitation; advise users to keep reference definitions on continuation lines within the task block when they want them to appear rendered in the collector.
