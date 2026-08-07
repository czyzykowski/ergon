# Move Issue Status Command

## Objective

Add a `move` command to ergon that transitions a Jira issue to a new status via the Jira transitions REST API, with an interactive picker when no target status is given.

## Success Criteria

- [x] `ergon move PCK-123` calls `GET /rest/api/3/issue/PCK-123/transitions`, displays a `Select` prompt listing available transition names, and on selection calls `POST /rest/api/3/issue/PCK-123/transitions` with `{ "transition": { "id": "<selected-id>" } }`
- [x] `ergon move PCK-123 --to "In Progress"` matches the transition name case-insensitively (no prompt) and transitions immediately
- [x] `ergon move` with no argument uses `state.lastIssueKey` as the issue key
- [x] `ergon move` with no argument and no `lastIssueKey` in state throws exactly: `"Provide an issue key or run from a previous issue."`
- [x] When `--to` value doesn't match any transition name, throws: `"No transition found for '<status>'. Available: Done, In Progress, ..."` (comma-separated list of available transition names)
- [x] After successful transition, prints exactly: `"Moved PCK-123 to Done"` (key and target status name)
- [x] `JiraClient.getTransitions(issueKey: string)` returns `JiraTransition[]`
- [x] `JiraClient.transitionIssue(issueKey: string, transitionId: string)` returns `Promise<void>`
- [x] `JiraClient.request()` handles 204 No Content responses (empty body) without throwing a JSON parse error
- [x] The `menu` command includes `{ name: "Move issue", value: "move" }` as the last entry in its options array
- [x] `registerMoveCommand` is called in `main.ts` between `registerOpenCommand` and `registerMenuCommand`
- [x] `deno check src/main.ts` — zero type errors
- [x] `deno task test` — all 12 existing tests pass

## Out of Scope

- Do not send transition fields (e.g. resolution, comment) — bare transition only
- Do not modify any existing command files (`start.ts`, `stop.ts`, `status.ts`, `open.ts`, etc.)
- Do not modify `types.ts`, `state.ts`, or `config.ts`
- Do not add unit tests (command hits live Jira API; manual verification is sufficient)
- Do not add fuzzy matching for transition names — exact case-insensitive match only

## Technical Context

- **Stack:** Deno, TypeScript, Cliffy v0.25.7 (CLI framework + prompts)
- **Entry point:** `/Users/lukasz/Code/ergon/src/main.ts`
- **Jira REST API v3:**
  - `GET /rest/api/3/issue/{key}/transitions` — returns:
    ```json
    {
      "transitions": [
        { "id": "11", "name": "Done", "to": { "name": "Done" } },
        { "id": "21", "name": "In Progress", "to": { "name": "In Progress" } }
      ]
    }
    ```
  - `POST /rest/api/3/issue/{key}/transitions` — request body:
    ```json
    { "transition": { "id": "11" } }
    ```
    Returns HTTP 204 No Content (empty response body) on success.
- **Cliffy `Select` prompt:** Already used in `/Users/lukasz/Code/ergon/src/commands/menu.ts` line 2 and lines 9-21

## Related Files

| File | Purpose | Key lines |
|------|---------|-----------|
| `/Users/lukasz/Code/ergon/src/commands/start.ts` | **Command pattern to follow** — optional issue key arg, config/state loading, `lastIssueKey` fallback, `JiraClient` instantiation | lines 7-41 (entire `registerStartCommand`) |
| `/Users/lukasz/Code/ergon/src/commands/menu.ts` | Menu options array — add "Move issue" entry | lines 11-19 (options array), line 2 (`Select` import) |
| `/Users/lukasz/Code/ergon/src/api/jira.ts` | Jira client — add new interfaces before class (line 90), add methods before `private request` (line 310), fix `request` body parsing (line 337) | lines 84-89 (last interface before class), lines 280-308 (`addWorklog` — last public method), lines 310-338 (`request` method) |
| `/Users/lukasz/Code/ergon/src/main.ts` | Command registration — add import and call | line 7 (`registerOpenCommand` import), line 28 (`registerOpenCommand(program)` call) |

## Pattern to Follow

### Command structure — copy from `start.ts` lines 7-18

```typescript
export function registerStartCommand(program: Command): void {
  program
    .command("start [issueKey:string]")
    .description("Start a timer for an issue.")
    .action(async (_options, issueKey?: string) => {
      const config = await loadConfig();
      const state = await loadState();
      const key = issueKey ?? state.lastIssueKey;

      if (!key) {
        throw new Error("Provide an issue key or run from a previous issue.");
      }
      // ...
    });
}
```

Keep: function signature pattern, `loadConfig`/`loadState` calls, `lastIssueKey` fallback, error message.
Change: command name (`"move"`), add `--to` option, use `JiraClient` for transitions instead of timer APIs, add `Select` prompt for interactive mode.

### Jira client method — copy from `addWorklog` (lines 281-308)

```typescript
async addWorklog(input: { ... }): Promise<JiraWorklogResponse> {
  const response = await this.request<JiraWorklogResponse>(
    `/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/worklog`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return response;
}
```

Keep: `this.request<T>` pattern, `encodeURIComponent(issueKey)`, method structure.
Change: endpoint path (`/transitions`), request/response types, `transitionIssue` returns `void` (204 No Content).

### Select prompt — copy from `menu.ts` lines 9-21

```typescript
const choice = await Select.prompt({
  message: "Choose an action",
  options: [
    { name: "Start timer", value: "start" },
    // ...
  ],
});
```

Keep: `Select.prompt` with `{ name, value }` options.
Change: message text, populate options dynamically from transitions list.

## Tasks

- [x] **Task 1: Add transition interfaces to `/Users/lukasz/Code/ergon/src/api/jira.ts`**
  - Add these interfaces after `JiraWorklogResponse` (after line 88, before the `JiraClient` class at line 90):
    ```typescript
    export interface JiraTransition {
      id: string;
      name: string;
      to: { name: string };
    }

    export interface JiraTransitionsResponse {
      transitions: JiraTransition[];
    }
    ```

- [x] **Task 2: Add `getTransitions` and `transitionIssue` methods to `JiraClient` in `/Users/lukasz/Code/ergon/src/api/jira.ts`**
  - Add after the `addWorklog` method (after line 308, before `private async request` at line 310):
    ```typescript
    async getTransitions(issueKey: string): Promise<JiraTransition[]> {
      const response = await this.request<JiraTransitionsResponse>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
        { method: "GET" },
      );
      return response.transitions;
    }

    async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
      await this.request<unknown>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
        {
          method: "POST",
          body: JSON.stringify({ transition: { id: transitionId } }),
        },
      );
    }
    ```

- [x] **Task 3: Fix `request` method to handle empty response bodies in `/Users/lukasz/Code/ergon/src/api/jira.ts`**
  - The `POST transitions` endpoint returns 204 No Content. The current `request` method at line 337 does `return (await response.json()) as T` which will throw on an empty body.
  - Replace line 337:
    ```typescript
    return (await response.json()) as T;
    ```
    With:
    ```typescript
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
    ```

- [x] **Task 4: Create `/Users/lukasz/Code/ergon/src/commands/move.ts`**
  - Imports:
    ```typescript
    import type { Command } from "cliffy/command/mod.ts";
    import { Select } from "cliffy/prompt/mod.ts";
    import { JiraClient } from "../api/jira.ts";
    import { loadConfig } from "../config.ts";
    import { loadState } from "../state.ts";
    ```
  - Export `registerMoveCommand(program: Command): void`
  - Command: `"move [issueKey:string]"`
  - Description: `"Transition a Jira issue to a new status."`
  - Option: `.option("--to <status:string>", "Target status name")`
  - Action:
    1. Load config and state, resolve key with `lastIssueKey` fallback (same as `start.ts` lines 11-18)
    2. `const jira = new JiraClient(config.jira)`
    3. `const transitions = await jira.getTransitions(key)`
    4. Determine target transition:
       - If `options.to` is set: find `transitions.find(t => t.name.toLowerCase() === options.to.toLowerCase())`
       - If no match found: `throw new Error(\`No transition found for '${options.to}'. Available: ${transitions.map(t => t.name).join(", ")}\`)`
       - If `options.to` is not set: prompt with `Select.prompt({ message: "Transition to", options: transitions.map(t => ({ name: t.name, value: t.id })) })`
       - After prompt, find the transition by the selected id: `transitions.find(t => t.id === selectedId)`
    5. `await jira.transitionIssue(key, transition.id)`
    6. `console.log(\`Moved ${key} to ${transition.name}\`)`

- [x] **Task 5: Register command in `/Users/lukasz/Code/ergon/src/main.ts`**
  - Add import after the `registerOpenCommand` import (after line 7):
    ```typescript
    import { registerMoveCommand } from "./commands/move.ts";
    ```
  - Add call after `registerOpenCommand(program);` (after line 28, before `registerMenuCommand`):
    ```typescript
    registerMoveCommand(program);
    ```

- [x] **Task 6: Add menu entry in `/Users/lukasz/Code/ergon/src/commands/menu.ts`**
  - Add after the `"Open in browser"` entry (after line 19, before the closing `],`):
    ```typescript
    { name: "Move issue", value: "move" },
    ```

- [x] **Task 7: Verify**
  - Run `deno check src/main.ts` — zero type errors
  - Run `deno task test` — all 12 existing tests pass
  - Manually test: `deno task ergon move <real-issue-key>` — shows transition picker
  - Manually test: `deno task ergon move <real-issue-key> --to "In Progress"` — transitions directly

## Assumptions

- Jira returns only transitions available from the issue's current workflow state (not all possible statuses)
- The `POST /rest/api/3/issue/{key}/transitions` endpoint returns HTTP 204 No Content on success (empty response body)
- Transition names from the Jira API are unique enough per issue for case-insensitive string matching
- The Cliffy `Select` prompt works correctly when there is only one option available
- `config.jira` is fully populated (guaranteed by `loadConfig` validation in `/Users/lukasz/Code/ergon/src/config.ts`)

## Verification Commands

```bash
deno check src/main.ts
deno task test
deno task ergon move PCK-123              # interactive: shows transition picker
deno task ergon move PCK-123 --to "Done"  # direct: transitions immediately
deno task ergon menu                      # shows "Move issue" option
```
