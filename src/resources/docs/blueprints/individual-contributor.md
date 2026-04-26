# Individual Contributor Notebook

This template is meant to help developers and PMs (_individual contributors_) organize their meeting notes and create a personal knowledge base.

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
   📁 Dev-Designs/        ← Dev design documents
   📄 All.todo.md         ← The collection of things to do
📁 01-ToRemember/         ← The personal wiki/knowledge base
   📁 Trainings/          ← Notes captured from trainings
📁 02-MeetingNotes/       ← All meeting notes to be preserved
   📁 1-1/                ← My 1-1 notes
📁 03-Inbox/              ← Default location for new notes
📁 04-Archive/            ← Old, unused files are preserved here
📁 05-Contacts/           ← Contact records and reference data
   📄 Colleagues.md       ← Colleagues managed by the Contacts sidebar
   📁 InterviewTemplates/ ← Interview problems and notes
   📁 DataTypes/          ← Reference data used by contacts
      📄 CareerLevels.md
      📄 CareerPaths.md
      📄 InterviewTypes.md
      📄 Pronouns.md
```

## Features

### Toggleable

| Feature | Enabled by Default |
|---------|--------------------|
| [Task Collector](../features/task-collector.md) | ✅ Yes |
| [Contacts](../features/contacts.md) | ✅ Yes |
| [Explorer Decorations](../features/decorations.md) | ✅ Yes |

### Always on
- [Open default file(s)](../features/default-files.md)
- [Dot-Folder Hiding](../features/dot-folder-hiding.md)

### Packaged AI Instructions

See [Packaged AI Instructions](../features/ai-instructions.md) for details on the WorkIQ agent and prompts deployed to `.github/`.

---

[⬅️ **Back** to Blueprints](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
