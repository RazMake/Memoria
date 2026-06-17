# Changelog

## 0.0.3

- Added **scheduled backups** — define backup profiles (in `.memoria/backup-config.json`) that compress selected workspace files into dated, incremental zip archives on a recurring schedule. Includes retention limits, a status-bar indicator, a guided **Create Backup Profile** wizard, manual **Run Backup**, **Backup History**, and an opt-in setting to catch up missed backups when VS Code starts.
- Added **templated text generation** (part of the Snippets feature) — render Markdown templates whose frontmatter declares values produced by functions (people pickers, dates, free text, conditionals, and your own `.ts` functions), then insert, copy, or save the result. The same templates can also be rendered outside VS Code through a bundled Node CLI with a PowerShell wrapper.
- Extended the visibility toggle to show/hide _individual files_, not just dot-folders — any file can be added to the managed list.
- Enhanced the **Contacts** feature — team members now include an Employee ID and evaluation fields.
- Improved the layout of the built-in notebook templates.

## 0.0.2

- This version is _publicly released_.
- Added auto-updating of markdown links on file rename.
- Added the capability to create a new file directly from the task editor.

## 0.0.1

- Initial verson, _not publicly released_.  
  The first version introduces customization of the file explore panel:
  - The capability of scaffolding a folder/file structure in the workspace based on **blueprints**.  
    In this version there are two blueprints available:
    - Individual Contributor Notebook
    - People Manager Notebook
  - And a number of quality of life little improvements:
    - Configurable colors of folders/files in the file explorer panel, to make it easier to find the desired folder.
    - The option to hide some or all of the dot-folders (configurable) in the file explorer panel
    - A right click command on folders that opens one _or more_ files side by side ("**Open default file(s)**").  
      Note: _The command only appears for folders that have configured default files (in `.memoria/default-files.json`)_.
