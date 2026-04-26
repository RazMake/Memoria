# Packaged AI Instructions

Both blueprints deploy a set of AI instruction files into your workspace under `.github/`. These include a custom **agent** and several **prompt files** that work together to help you initialize and maintain your notebook using the [WorkIQ MCP server](https://github.com/microsoft/workiq).

> **Note:** The prompts require the **WorkIQ MCP server** to be installed and running. Use the [Install WorkIQ MCP Server](#prompt-install-workiq-mcp-server) prompt to set it up.

---

## Agent: WorkIQ

**File:** `.github/agents/WorkIQ.agent.md`

A custom AI agent specialized in querying the WorkIQ MCP server. It can answer organization-related questions such as:

- Who is on a given team?
- Who reports to a given person?
- What are the career levels for a given discipline?

To use it, open the GitHub Copilot Chat panel and select **WorkIQ** from the agent picker (the `@` menu).

---

## Prompt: Install WorkIQ MCP Server

**File:** `.github/prompts/install-workiq-mcp.prompt.md`

Sets up the WorkIQ MCP server at workspace level by creating or updating `.vscode/mcp.json`. Run this prompt once when setting up a new workspace, or when the WorkIQ server is missing.

To run it, open the GitHub Copilot Chat panel and use `/install-workiq-mcp` (or find it in the prompt picker).

---

## Prompt: Initialize Contacts

**File:** `.github/prompts/initialize-contacts.prompt.md`

Uses the WorkIQ agent to query your organization and populate your contact files with real data:

| Blueprint | Files populated |
|-----------|-----------------|
| Individual Contributor | `Peers.md`, `Colleagues.md` |
| People Manager | `Team.md`, `Peers.md`, `Colleagues.md` |

Run this prompt after initializing your workspace to replace the sample contact entries with real members from your organization.

---

## Prompt: Initialize Career Data Types

**File:** `.github/prompts/initialize-career-data-types.prompt.md`

Uses the WorkIQ agent to sync career level and career path reference data from your organization. Updates `CareerLevels.md` with actual org level codes and job titles, which are later used to set properties of contacts in the notebook's contact database.

Run this prompt before (or alongside) **Initialize Contacts** so that contact fields like `CareerPathKey` resolve correctly.

---

[⬅️ **Back** to Features](index.md) 💠 [Getting Started](../getting-started.md) 💠 [Blueprints](../blueprints/index.md) 💠 [FAQ](../faq.md)
