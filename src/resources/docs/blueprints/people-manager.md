# People Manager Notebook

This template is meant to help managers organize their meeting notes and create a personal knowledge base.

## Folder Structure

```text
📁 .github/               ← AI instruction files (agent + prompts)
   📁 agents/
      📄 WorkIQ.agent.md  ← WorkIQ AI agent
   📁 prompts/
      📄 install-workiq-mcp.prompt.md
      📄 initialize-contacts.prompt.md
      📄 initialize-career-data-types.prompt.md
📁 00-Workstreams/        ← All active workstreams
   📁 Planning/           ← Planning notes, grouped by quarter
   📁 Team-Evaluations/   ← Individual team members' evaluations
   📄 All.todo.md         ← The collection of things to do
📁 01-ToRemember/         ← The personal wiki/knowledge base
   📁 Trainings/          ← Notes captured from trainings
   📁 Hiring/             ← The process for hiring
   📁 Evaluation/         ← Notes about evaluating people
📁 02-MeetingNotes/       ← All meeting notes to be preserved
📁 03-Inbox/              ← Default location for new notes
📁 05-Archive/            ← Old, unused files are preserved here
📁 06-Autocomplete/       ← Contacts, snippets, and autocomplete data
   📁 Contacts/           ← Contact records and reference data
      📄 Team.md          ← Direct reports managed by the Contacts sidebar
      📄 Peers.md         ← Peers managed by the Contacts sidebar
      📄 Colleagues.md    ← Colleagues managed by the Contacts sidebar
      📁 InterviewTemplates/ ← Interview problems and notes
      📁 DataTypes/       ← Reference data used by contacts
         📄 CareerLevels.md
         📄 CareerPaths.md
         📄 InterviewTypes.md
         📄 Pronouns.md
   📁 Snippets/           ← TypeScript snippet files for text expansion
      📄 date-time.ts     ← Date, time, and now snippets
      📄 heading-children.ts ← Copy sub-heading content
```

## Features

### Toggleable

| Feature | Enabled by Default |
|---------|--------------------|
| [Task Collector](../features/task-collector.md) | ✅ Yes |
| [Contacts](../features/contacts.md) | ✅ Yes |
| [Explorer Decorations](../features/decorations.md) | ✅ Yes |
| [Snippets](../features/snippets.md) | ✅ Yes |

### Always on
- [Open default file(s)](../features/default-files.md)
- [Dot-Folder Hiding](../features/dot-folder-hiding.md)

### Packaged AI Instructions

See [Packaged AI Instructions](../features/ai-instructions.md) for details on the WorkIQ agent and prompts deployed to `.github/`.

---

[⬅️ **Back** to Blueprints](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
