# Ergon CLI Implementation Plan

## 1. Scope and Goals

- Build `ergon`, a Deno-based CLI for Jira + Clockwork workflows.
- Target runtime environment: NixOS (development on macOS).
- Core goals: ticket creation, timer control, time logging, ticket
  listing/search.
- Secondary goals: interactive TUI, tmux integration, Telegram bot hooks.
- Future goals: local YAML enrichment, AI review/plan, MCP overlay.

## 2. Key Use Cases (CLI)

- `ergon new <summary>`: interactive ticket creation, optional timer start.
- `ergon start <issue>` / `ergon stop`: timer control.
- `ergon status [--json]`: current timer + today’s totals.
- `ergon log <issue> <duration> <desc>`: log time without timer.
- `ergon ls [--sprint|--project|--blocked|--in-progress]`: list tickets.
- `ergon search <query>`: search Jira.
- `ergon menu`: optional TUI shortcut for timer/new/list.

## 3. Architecture Overview

- Single CLI entry point with subcommands (Cliffy).
- API clients:
  - Jira REST client (create/search/get/epics).
  - Clockwork client (start/stop/worklogs).
- Config loader for YAML config at `~/.config/ergon/config.yaml`.
- Local state store for “last project/epic” + current timer metadata.
- Output formatting for human and JSON (status).

## 4. Project Structure

```
ergon/
├── deno.json
├── src/
│   ├── main.ts
│   ├── commands/
│   │   ├── new.ts
│   │   ├── start.ts
│   │   ├── stop.ts
│   │   ├── status.ts
│   │   ├── log.ts
│   │   ├── ls.ts
│   │   ├── search.ts
│   │   └── menu.ts
│   ├── api/
│   │   ├── jira.ts
│   │   └── clockwork.ts
│   ├── config.ts
│   ├── state.ts
│   ├── yaml.ts
│   └── types.ts
└── scripts/
    └── ergon-status-tmux
```

## 5. Configuration

- Config path: `~/.config/ergon/config.yaml`.
- Schema: Jira, Clockwork, projects, defaults, paths (jira_yaml).
- Support env var tokens (`${JIRA_API_TOKEN}` style) via expansion.

## 6. Core Implementation Steps

### 6.0 Project Setup (flake.nix)

- Add `flake.nix` to define the Deno dev environment.
- Include Deno, git, and any CLI tooling needed for development.
- Provide a `devShell` entry for contributors.

### 6.1 CLI Skeleton

- Set up Deno project, `main.ts`, and Cliffy command registration.
- Ensure CLI name is `ergon`.
- Add version + description.

### 6.2 Config Loader

- YAML reader with env var expansion.
- Validate required keys and present friendly error messages.

### 6.3 Jira Client

- Implement create issue, search by JQL, get issue, list epics.
- Map Jira responses into shared `JiraIssue` types.

### 6.4 Clockwork Client

- Implement start/stop timer, get worklogs, format durations.
- Document limitation: no official “current timer” endpoint.

### 6.5 Local State

- Persist last used project/epic and current timer metadata.
- Store in `~/.config/ergon/state.json`.
- Update on `new`, `start`, and `stop`.

### 6.6 Commands

- `new`: interactive project/epic/type selection, optional quick mode.
- `start`: start timer on issue or last issue.
- `stop`: stop current timer using state.
- `status`: derive today totals from Clockwork + local timer status.
- `log`: send a Jira worklog or Clockwork log (depends on API coverage).
- `ls`: Jira query with filters.
- `search`: Jira JQL search for text.
- `menu`: optional TUI using Cliffy prompts (avoid external gum dependency).

## 7. Tmux Integration

- Provide a script `ergon-status-tmux` using `ergon status --json`.
- Keep script aligned with tmux sample and JSON fields.

## 8. Local YAML Enrichment (Future)

- Read Jira YAML in `paths.jira_yaml`.
- Preserve `local:` block on sync and expose review/plan commands later.

## 9. Testing & Validation

- Add smoke tests for config loading and API error handling.
- Manual CLI workflows: new/start/stop/status/log/ls/search.
- Validate tmux status script output.

## 10. Delivery Checklist

- `ergon` binary install command:
  - `deno install --allow-net --allow-read --allow-env --allow-write --name ergon src/main.ts`
- Example usage in docs and tmux script uses `ergon`.
- Ensure config path references `~/.config/ergon`.
