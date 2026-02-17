# Open Issue in Browser Command

## Objective

Add an `open` command to ergon that opens a Jira issue in the default browser, using `open` on macOS and `xdg-open` on Linux, and add a corresponding menu entry.

## Success Criteria

- [ ] `ergon open PCK-123` opens `https://<jira.baseUrl>/browse/PCK-123` in the default browser
- [ ] `ergon open` with no argument falls back to `state.lastIssueKey` and opens that issue
- [ ] `ergon open` with no argument and no `lastIssueKey` in state throws a clear error: `"Provide an issue key or run from a previous issue."`
- [ ] On macOS (`Deno.build.os === "darwin"`), the command spawns `open <url>`
- [ ] On Linux (`Deno.build.os === "linux"`), the command spawns `xdg-open <url>`
- [ ] On unsupported OS, throws an error: `"Unsupported platform: <os>"`
- [ ] The `menu` command includes an "Open in browser" entry with value `"open"`
- [ ] The `open` command is registered in `main.ts` alongside existing commands
- [ ] The deno task in `deno.json` includes `--allow-run` permission
- [ ] `deno task ergon open PCK-123` works end-to-end (manual verification)
- [ ] All existing tests pass: `deno task test`

## Out of Scope

- Do not validate that the issue key exists in Jira (just open the URL directly)
- Do not modify any existing command implementations
- Do not add Windows support (only macOS and Linux)
- Do not add unit tests for the `open` command (it shells out to OS commands; manual verification is sufficient)
- Do not modify types.ts, state.ts, or config.ts

## Technical Context

- **Stack:** Deno, TypeScript, Cliffy v0.25.7 for CLI framework
- **Entry point:** `/Users/lukasz/Code/ergon/src/main.ts`
- **Config type:** `ErgonConfig.jira.baseUrl` (string, e.g. `https://example.atlassian.net`) — defined in `/Users/lukasz/Code/ergon/src/types.ts` lines 1-5
- **State type:** `ErgonState.lastIssueKey` (string | undefined) — defined in `/Users/lukasz/Code/ergon/src/types.ts` lines 97-104
- **Deno subprocess API:** Use `new Deno.Command(cmd, { args }).spawn()` — fire-and-forget, no need to wait for exit

## Related Files

| File | Purpose |
|------|---------|
| `/Users/lukasz/Code/ergon/src/commands/start.ts` | **Pattern to follow** — simple command with optional issue key argument, config/state loading, fallback to `state.lastIssueKey` |
| `/Users/lukasz/Code/ergon/src/commands/menu.ts` | Menu entries to add "Open in browser" option |
| `/Users/lukasz/Code/ergon/src/main.ts` | Command registration — add import and `registerOpenCommand(program)` call |
| `/Users/lukasz/Code/ergon/src/config.ts` | `loadConfig()` function |
| `/Users/lukasz/Code/ergon/src/state.ts` | `loadState()` function |
| `/Users/lukasz/Code/ergon/deno.json` | Deno task config — needs `--allow-run` added |

## Pattern to Follow

The `start` command in `/Users/lukasz/Code/ergon/src/commands/start.ts` lines 7-41 is the closest pattern:

```typescript
// Registration function signature:
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
      // ... action
    });
}
```

Follow this exact structure for the `open` command. The key differences:
- No API calls to Jira or Clockwork (just construct URL and open)
- No state saving (read-only operation)
- Add OS-detection logic to pick the right browser-open command

## Tasks

- [x] **Task 1: Create `/Users/lukasz/Code/ergon/src/commands/open.ts`**
  - Import `Command` from `cliffy/command/mod.ts`
  - Import `loadConfig` from `../config.ts`
  - Import `loadState` from `../state.ts`
  - Export `registerOpenCommand(program: Command): void`
  - Command name: `"open [issueKey:string]"`
  - Description: `"Open a Jira issue in the default browser."`
  - Action implementation:
    1. `const config = await loadConfig()`
    2. `const state = await loadState()`
    3. `const key = issueKey ?? state.lastIssueKey`
    4. If no key, throw `new Error("Provide an issue key or run from a previous issue.")`
    5. Construct URL: `${config.jira.baseUrl}/browse/${key}`
    6. Detect OS: `Deno.build.os`
    7. If `"darwin"` → `cmd = "open"`, if `"linux"` → `cmd = "xdg-open"`, else throw `new Error("Unsupported platform: ...")`
    8. Spawn: `new Deno.Command(cmd, { args: [url] }).spawn()`
    9. Log: `console.log("Opening ${key} in browser...")`

- [x] **Task 2: Register the command in `/Users/lukasz/Code/ergon/src/main.ts`**
  - Add import: `import { registerOpenCommand } from "./commands/open.ts";`
  - Add registration call: `registerOpenCommand(program);` after the existing `registerSearchCommand(program);` line (before `registerMenuCommand`)

- [x] **Task 3: Add menu entry in `/Users/lukasz/Code/ergon/src/commands/menu.ts`**
  - Add `{ name: "Open in browser", value: "open" }` to the options array
  - Place it after `"Search issues"` and before the end of the array (last entry)

- [x] **Task 4: Add `--allow-run` to the deno task in `/Users/lukasz/Code/ergon/deno.json`**
  - Change the `ergon` task from:
    `"deno run --allow-net --allow-read --allow-env --allow-write src/main.ts"`
  - To:
    `"deno run --allow-net --allow-read --allow-env --allow-write --allow-run src/main.ts"`

- [x] **Task 5: Verify**
  - Run `deno task test` — all existing tests must pass
  - Run `deno check src/main.ts` — no type errors
  - Manually test: `deno task ergon open <real-issue-key>` opens the browser

## Assumptions

- `config.jira.baseUrl` does not have a trailing slash (consistent with typical Jira Cloud URLs like `https://example.atlassian.net`)
- The `open` (macOS) and `xdg-open` (Linux) commands are available in the user's PATH
- Fire-and-forget subprocess spawning is acceptable (no need to wait for the browser to close)
- The command does not need to update `state.lastIssueKey` since it's a read-only operation

## Verification Commands

```bash
deno check src/main.ts
deno task test
deno task ergon open PCK-123  # manual: should open browser
deno task ergon menu           # manual: should show "Open in browser" option
```
