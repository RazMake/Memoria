---
description: "Sync CareerPaths.md and CareerLevels.md from the organization's live data via WorkIQ MCP server"
name: "Initialize Career Data Types"
agent: "agent"
tools: [read/readFile, agent, edit/editFiles]
---

Use the `WorkIQ` agent to build the complete list of career levels that can be later used to set the properties of the contacts in the memoria's database.

## Steps

1. **Read [CareerPaths.md](../../05-Autocomplete/Contacts/DataTypes/CareerPaths.md)** and extract from it the list of career names (including alternatives).

2. **Ask WorkIQ agent** to use a `workiq` MCP server to query for the list of career levels, bands and the corresponding title for career path name.
Use a query like: "_What are the career levels, bands, and titles for the disciplines <career path names here, including alternatives>? Provide the full mapping of Level → Band → Title for each discipline._".
From the results:
   - Collect every unique career level / discipline level (e.g. L59, L60, L61 … intern …).
   - For each career path, collect the actual job titles used at each level (e.g. "Senior Software Engineer" at L63, "Principal Software Engineer" at L65 …).

3. **Understand the level-ID scheme before reconciling.**
   - The current entries in `CareerLevels.md` are **initial template placeholders** — the `Id` values and heading keys need to be updated to match the real org level codes from WorkIQ.
   - The `Id` field must equal the org's numeric level code (e.g. org level L59 → `Id: 59`).
   - The heading key must stay in sync with the `Id`: e.g. `# l59` for `Id: 59`, `# intern` for the intern entry (no numeric level).
   - `MinimumCareerLevel` on career-path entries uses the same numeric `Id` values (e.g. `59` for the lowest IC level, `0` or a special value for intern-eligible paths).

   Before writing any changes, build and display a **level-mapping table** that shows:

   | Template key | Template Id | → | Actual org level | Actual Id | Example title (from WorkIQ) | TitlePattern |
   |---|---|---|---|---|---|---|
   | `# l1` | 1 | → | L59 | 59 | Software Engineer | `{CareerPath}` |
   | `# intern` | 0 | → | intern | 0 | Software Engineer Intern | `{CareerPath} Intern` |
   | _(new)_ | — | → | L63 | 63 | Senior Software Engineer | `Senior {CareerPath}` |

   Use this table as the authoritative reference for all subsequent edits.

4. **Reconcile CareerLevels.md**
   - Keep every level that still exists in the org; update any template placeholder `Id` and heading key to the real org numeric level code.
   - Add any new level found in WorkIQ that is not yet present.
   - Remove levels that no longer appear in the org.
   - The heading key and `Id` must always match (e.g. `# l63` → `- Id: 63`).
   - For `TitlePattern`: derive it from the actual org job titles returned by WorkIQ by replacing the career-path name with `{CareerPath}` (e.g. "Senior Software Engineer" at L63 → `Senior {CareerPath}`). Use the existing entries in the file as examples of the expected pattern format. If multiple career paths use different modifiers at the same level, prefer the most common pattern and note any exceptions.
   - Preserve the existing schema for each entry, as found in the file.

5. **Write the updated file [CareerLevels.md](../../05-Autocomplete/Contacts/DataTypes/CareerLevels.md)** using file-editing tools. Do not reformat unchanged entries.

7. **Summarize** what was added, removed, or left unchanged for each file. Call out:
   - Any `Short` abbreviations that were inferred (not from WorkIQ) so the user can verify them.
   - Any `TitlePattern` values that could not be confidently derived and were left unchanged or estimated.

## Constraints

- Do not fabricate level IDs — derive them from WorkIQ data only.
- Short abbreviations may be inferred when WorkIQ does not supply them, but must be flagged in the summary.
- TitlePatterns should be derived from actual org titles; if a pattern cannot be confidently determined, leave the existing value and note it in the summary, _so the user can manually fix it_.
