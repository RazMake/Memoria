---
description: Use WorkIQ to discover an org subtree starting from a person and route everyone into Team.md (direct reports), Peers.md (managers), Colleagues.md (individual contributors), and Management.md (the person's management chain), capturing EmployeeID for everyone. Supports refreshing or fully replacing the lists after team changes.
name: "Contacts Update"
agent: "agent"
tools: [read/readFile, agent, edit/editFiles]
---

Use **WorkIQ** (the `ask_work_iq` tool or the `WorkIQ` agent) to discover an org subtree starting from a person, then write people into four contact files using each file's own schema:
- [Team.md](../../10-Autocomplete/Contacts/Team.md)
- [Peers.md](../../10-Autocomplete/Contacts/Peers.md)
- [Colleagues.md](../../10-Autocomplete/Contacts/Colleagues.md)
- [Management.md](../../10-Autocomplete/Contacts/Management.md)

## Inputs (ask me if not provided)

1. **Person** — the person whose org subtree to sync. Accept an alias or a full name. **Default: me** (the current user). Referred to below as **P**.
2. **Mode** — one of:
   - **`refresh`** *(default)* — re-pull WorkIQ data, **update** existing entries, and **add** newly-appeared people. **Never delete** anyone.
   - **`replace`** — treat WorkIQ as the source of truth (use after team changes). **Add**, **update**, and **delete** entries for people who no longer belong in scope.

## Step 1 — Discover the org subtree

Resolve aliases (email prefix before `@`) for everyone via WorkIQ. Let **M** = P's manager and **GM** = M's manager.

**Goal:** enumerate every person under GM (recursively), including GM. To make this fast, **parallelize the recursive enumeration aggressively** — only the unavoidable chain `P → M → GM` is sequential; everything below GM fans out concurrently.

### 1a — Seed the tree (sequential, minimal)

These three lookups depend on each other and must run in order:
1. Resolve **P**, then get P's manager **M**.
2. Get M's manager **GM**.
3. Get **GM's direct reports** (one WorkIQ call). This yields M, M's peers, and any ICs reporting straight to GM.

Also walk **P's management chain upward** (GM's manager and above) — issue these chain lookups in parallel with the fan-out below, since they don't depend on the subtree.

### 1b — Fan out the subtree (parallel)

Each of GM's direct reports roots an **independent subtree**, so explore them **simultaneously, not one after another**:

- **Launch one `agent` subagent per manager** among GM's direct reports (and recursively, per manager discovered inside each subtree). Each subagent fully enumerates **its own** subtree: every descendant, recursively, capturing for each person the fields listed in Step 2 (alias, first name, full name, EmployeeID, job title, pronouns) plus **whether they have direct reports** (the manager flag).
- Run as many of these subagent calls **in the same batch** as possible. Do **not** wait for one branch before starting another. The only ordering constraint is that a manager must be discovered before its children can be expanded — so expand each newly-found manager's children in the next parallel batch.
- Keep each subagent's job narrow and well-defined: "enumerate the complete org subtree under `<manager-alias>` and return a flat list of people with their fields and manager-flag." Give it exactly the field list and the manager-flag requirement so results come back uniform.
- If WorkIQ supports retrieving a manager's entire subtree in one call, prefer that over per-level expansion — but still issue the calls for different managers **concurrently**.

**Be gentle to WorkIQ — parallel does not mean unlimited:**
- Treat WorkIQ as a rate-limited, shared service. Favor **fewer, broader** calls (whole-subtree queries, batched lookups) over many small per-person requests.
- Cap concurrency to a **reasonable batch size** (roughly 4–6 in-flight calls at once) rather than firing every branch simultaneously. Drain a batch before launching the next.
- **Never re-query data you already have.** Cache and reuse each person's fields across routing and entry-building; don't ask WorkIQ for the same person twice.
- Prefer a single call that returns multiple fields per person over separate calls per field.
- If WorkIQ returns throttling, rate-limit, or transient errors, **back off** (slow down, reduce concurrency, retry sparingly) instead of hammering it with retries.

When all branches return, **merge** the flat lists, de-duplicating by alias/EmployeeID (a person must appear once). Resolve any conflicts by re-querying WorkIQ for that individual.

### 1c — Route each person

Route each enumerated person into **exactly one** file using these rules (always exclude **P** themselves):

1. **Team** — the person reports **directly** to **P**.
2. **Peers** — the person reports **directly** to **M** and is **confirmed to be a manager** (has one or more direct reports).
3. **Management** — the person is in **P's management chain** (i.e. **M**, **GM**, and any manager above them up the chain).
4. **Colleagues** — everyone else in the enumeration.

**Manager classification:** treat a person as a manager if WorkIQ confirms they have one or more direct reports, even if their title does not contain "Manager". When unsure, ask WorkIQ for that person's direct reports as evidence. (Subagents should return this flag directly so routing needs no extra lookups.)

## Step 2 — Build each contact entry

Each contact is an H1 heading equal to the person's **alias**, followed by the property bullets in the order shown in that file's existing schema. Capture **`EmployeeID` for everyone** in all four files.

For each person retrieve from WorkIQ: first name, full name, **employee id / personnel number**, job title, and pronouns (if available).

| Property | Files | Source | Notes |
|----------|-------|--------|-------|
| `Nickname` | all | First name | First name unless already customized (see preservation rule). |
| `FullName` | all | Full name | |
| `EmployeeID` | all | Employee ID / Personnel number | Capture for everyone. |
| `Title` | all | Job title | Verify & normalize against the data files (see **Title verification** below). Leave empty if WorkIQ returns "Not specified". |
| `CareerPathKey` | all | Derived from `Title` | Map using [CareerPaths.md](../../10-Autocomplete/Contacts/DataTypes/CareerPaths.md) (H1 keys). E.g. "Software Engineer" → `sde`, "Product Manager" → `pm`, "Engineering Manager" → `em`. If no match, leave empty. |
| `PronounsKey` | all | Pronouns | Map to an H1 key in [Pronouns.md](../../10-Autocomplete/Contacts/DataTypes/Pronouns.md). If missing, **guess** (see **Pronoun guessing** below). |
| `LevelId` | Team only | — | **Leave empty.** Titles only map to a level *range* (e.g. "Senior" = 63 or 64) and cannot be disambiguated. |
| `LevelStartDate` | Team only | — | **Leave empty.** Not available in directory data. |
| `BandRank` | Team only | — | **Leave empty.** Manager's subjective rating; not available via WorkIQ. |
| `OverallRank` | Team only | — | **Leave empty.** Manager's subjective rating; not available via WorkIQ. |

Match each file's existing property order and which properties it carries (Peers, Colleagues, and Management do not carry `LevelId`, `LevelStartDate`, `BandRank`, `OverallRank`). **Leave any property you cannot find empty** (keep the bullet, with no value after the colon).

### Title verification & normalization

Every title must be constructible from the two data files (**do not modify those files**):
- [CareerPaths.md](../../10-Autocomplete/Contacts/DataTypes/CareerPaths.md) supplies the career-path name (`Name`), short form (`Short`), and key (the H1).
- [CareerLevels.md](../../10-Autocomplete/Contacts/DataTypes/CareerLevels.md) supplies the `TitlePattern` for each level, where `{CareerPath}` is replaced by a career-path `Name`.

For each person's WorkIQ title:
1. Find a (`TitlePattern`, career-path `Name`) combination that produces that title (e.g. `Senior {CareerPath}` + `Software Engineer` = "Senior Software Engineer"). Match on meaning, ignoring casing and short/long variants and listed `Alternatives`.
2. **If a match is found**, write the **normalized** canonical title (exact casing and wording from the data files) into `Title`, and set `CareerPathKey` to that path's H1 key.
3. **If no combination can build the title**, leave `Title` as the original WorkIQ value, leave `CareerPathKey` empty, and **signal it to me** in the summary (see Step 4 — Unmatched titles).

### Pronoun guessing

When WorkIQ does not provide pronouns, **guess** a `PronounsKey` from [Pronouns.md](../../10-Autocomplete/Contacts/DataTypes/Pronouns.md) based on the person's name. Record every guess so it can be shown for validation in Step 4. (A guessed value is still written to the file; I can correct it later.)

## Step 3 — Apply changes to the files

**Preservation rule (both modes):** Never overwrite a **non-empty** value that WorkIQ does not own. This protects fields I maintain manually:
- `LevelId`, `LevelStartDate`, `BandRank`, `OverallRank`
- A `Nickname` that already differs from the person's first name (assume I customized it)

Apply per mode:

- **`refresh`**: For each in-scope person — update existing entries (respecting the preservation rule) and add any new ones. Do **not** remove anyone.
- **`replace`**: Same as refresh, **plus** delete entries for anyone in the four files who is no longer in scope, and **move** anyone whose routing changed to the correct file (e.g. a Colleague who became a manager moves to Peers).

Never blank out a field just because WorkIQ didn't return it — only set values that were found.

## Step 4 — Summarize what changed

Report a concise summary grouped **per file** (Team / Peers / Colleagues / Management). For each person list **only the property names** that were set (never the values):

- **Added** — `<alias>`: set [`Prop1`, `Prop2`, …]
- **Updated** — `<alias>`: set [`Prop1`, `Prop2`, …]
- **Moved** — `<alias>`: from `<file>` → `<file>` *(replace mode only)*
- **Deleted** — `<alias>` *(replace mode only)*

If a group is empty, state "none". End with total counts across all files (e.g. "5 added, 8 updated, 1 moved, 2 deleted").

**Unmatched titles** — list every person whose WorkIQ title could **not** be built from CareerPaths.md + CareerLevels.md, with the raw title, so I can reconcile the data files. If none, state "none".

**Guessed pronouns** — show a table of every person whose pronouns were **guessed** (not provided by WorkIQ) for me to validate:

| Alias | Full name | Guessed PronounsKey |
|-------|-----------|---------------------|

If none were guessed, state "none".
