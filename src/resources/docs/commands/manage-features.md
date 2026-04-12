# Manage features

**Command:** `Memoria: Manage features`
**Available:** After workspace is initialized

Opens a multi-select picker where you can enable or disable optional blueprint features. Checked features are enabled; unchecked features are disabled.

Features available in the picker depend on your blueprint. For the built-in blueprints, the following features appear:

- [Explorer Decorations](../features/decorations.md) — Color-coded badges and labels on folders in the file explorer
- [Default Files](../features/default-files.md) — Right-click to open pre-configured files side by side
- [Dot-Folder Hiding](../features/dot-folder-hiding.md) — Hide configuration folders from the Explorer

> **Note:** Currently only **Explorer Decorations** has a runtime toggle effect. Default Files and Dot-Folder Hiding are controlled through their own commands.

Changes are saved to `.memoria/features.json` and take effect immediately.

![Manage features](../media/manage-features.gif)

---

[⬅️ **Back** to Commands](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
