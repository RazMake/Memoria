# Individual Contributor Notebook

This template is meant to help developers and PMs (_individual contributors_) organize their meeting notes and create a personal knowledge base.

## Folder Structure

```text
📁 .github/               ← AI instruction files (agent + prompts)
   📁 agents/
      📄 WorkIQ.agent.md  ← WorkIQ AI agent
   📁 instructions/
   📁 prompts/
      📄 contacts-update.prompt.md
   📁 skills/
📁 00-Workstreams/        ← All active workstreams
   📁 My-Evaluation/      ← Self-evaluation tracking
   📄 All.todo.md         ← The collection of things to do
📁 01-MeetingNotes/       ← All meeting notes to be preserved
   📁 1-1/                ← 1:1 meeting notes
📁 02-Inbox/              ← Default location for new notes
📁 03-ToRemember/         ← The personal wiki/knowledge base
   📁 Trainings/          ← Notes captured from trainings
📁 04-Archive/            ← Old, unused files are preserved here
📁 10-Autocomplete/       ← Contacts, snippets, and autocomplete data
   📁 Contacts/           ← Contact records and reference data
      📄 Peers.md         ← Peers managed by the Contacts sidebar
      📄 Colleagues.md    ← Colleagues managed by the Contacts sidebar
      📄 Management.md    ← Management chain
      📁 DataTypes/       ← Reference data used by contacts
         📄 CareerLevels.md
         📄 CareerPaths.md
         📄 InterviewTypes.md
         📄 Pronouns.md
   📁 Snippets/           ← TypeScript snippet files for text expansion
      📄 date-time.ts     ← Date, time, and now snippets
      📄 heading-children.ts ← Copy sub-heading content
📁 11-Templates/          ← Templates for interviews and notes
   📁 Interview/
   📁 Notes/
📁 12-Settings/           ← Settings and configuration
   📁 Setup/
📁 13-Scripts/            ← Automation scripts
   📁 Utils/
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
- [Folder/File Visibility](../features/dot-folder-hiding.md)

### Packaged AI Instructions

See [Packaged AI Instructions](../features/ai-instructions.md) for details on the WorkIQ agent and prompts deployed to `.github/`.

---

[⬅️ **Back** to Blueprints](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
