---
description: These instructions are generic, meant only for default agents.
---

# Instruction Precedence

When instructions from different files conflict, follow this precedence order (highest to lowest):

1. **Project-specific** — Memory bank files for the specific project/tool you're working on
   - Example: `.memory-bank/systemPatterns.md` overrides generic patterns
   
2. **Generic design** — Cross-cutting principles that apply everywhere
   - [generic-design-principles.md](./focusedInstructions/generic-design-principles.md)
   - [class-architecture-patterns.md](./focusedInstructions/class-architecture-patterns.md)
   
3. **Language-general** — Fallback patterns when no specific guidance exists

When in genuine doubt, ask the user for clarification rather than making assumptions.

# Build and Test Requirements

**THIS IS EXTREMELY IMPORTANT!**
- Build the project after EACH code change to verify compilation succeeds
- Run ALL relevant tests at the END of the task to verify functionality
- Do not declare success until both build and tests pass

# Skills
- Refer to the [skills](./focusedInstructions/skills.md) instructions.

# Memory Bank Usage
- The knowledge about the current project resets completely between sessions. This isn't a limitation - it's the reason why I maintain perfect documentation.
  Refer to the [memory-bank](./focusedInstructions/memory-bank.md) instructions for further details.
- **IMPORTANT**: Always use the `.memory-bank/` folder at the repo root for all project knowledge. Do NOT use `/memories/repo/` (Copilot's workspace-scoped memory). `.memory-bank/` is checked into git so it survives forks, clones, and machine changes.

# Design principles
Follow the [design principles](./focusedInstructions/generic-design-principles.md).

# Coding guidelines
Follow the instructions in the following files:
- [class architecture](./focusedInstructions/class-architecture-patterns.md)
- [feature development](./focusedInstructions/feature-development.md)

# Testing guidelines
Follow the [testing guidelines](./focusedInstructions/testing-guidelines.md) instructions.
