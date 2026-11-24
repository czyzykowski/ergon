# A Deep Module Behind `ergon new`

## Problem Statement

The `ergon new` action in `src/commands/new.ts` is about 310 lines of
orchestration with no in-process test. Its decisions — which project, which
Epic, what to Inherit, which labels, which Client SOW, which Sprint, what to
remember — are made inline, between prompts and Jira calls. Two small pure
helpers, `resolveFields` and `rememberCreated` in `src/commands/new_fields.ts`,
were pulled out to be tested, but the bugs keep landing in how the action calls
them: `81e1016`, `e6aac22` and `8c29ae8` all fixed `new.ts` and none touched
`new_fields.ts`.

The split between Interactive and Non-interactive, which
[ADR 0001](../docs/adr/0001-non-interactive-ignores-remembered-state.md)
promised would live in one place, is now spread over six sites: the
`state.lastProject` and `state.lastEpic` reads, the choice of whom to Inherit
from, `resolveFields`, the Sprint gate and `rememberCreated`. ADR 0001's own
2026-11-24 note admits it. The Cache read-through is hand-written four times,
with eleven `useCache` branches.

The only test that reaches the action is `tests/main_test.ts`, which runs ergon
as a subprocess against a dead Jira URL. It can prove a refusal that happens
before the first Jira call and nothing after it.

Three behaviours have also drifted between modes, or between `new` and `edit`:

- **`--sprint <name>`** is refused without a terminal ("Resolving --sprint by
  name needs interactive mode") although `edit --sprint <name>` resolves the
  same name without prompting, through `resolveSprintId` in `src/sprint.ts`. An
  Interactive `new --sprint <name>` also asks for a board first, where `edit`
  searches the project's boards.
- **An Epic chosen in an Interactive run is not Inherited from.**
  `inheritFromKey = parentKey ?? (interactive ? undefined : epicKey)`: a script
  given `--epic` takes the Epic's labels and Client SOW, a person who picks the
  same Epic at the prompt gets neither. The glossary says an Epic is a way of
  picking a Parent, and that Inherit is from the Parent.
- **A Parent with `labels: []`** is read as nothing to Inherit in a
  Non-interactive run, which falls through to the configured labels, but stops
  the chain in an Interactive one, which skips the configured labels and
  prompts.

## Solution

One deep module turns a new-issue draft into a created issue. It takes the
parsed flags, the already-read Description, config, Remembered state and the
run's mode, and returns the created issue and the next state. It reaches the
outside world through two seams:

- a **Prompter**, with one method per question. Three adapters: cliffy for an
  Interactive run, one that throws on every method for a Non-interactive run,
  and a scripted one in tests.
- a narrow **Jira port**, listing only the calls `ergon new` makes. `JiraClient`
  satisfies it unchanged; a Cache decorator wraps it unless `--no-cache` is
  given; tests use a fake.

The action shrinks to wiring: read the Description Source, build the adapters,
call the module, save the state, print the result.

The three drifts are fixed on top of the new seam, each as its own commit with
its own red test.

## User Stories

1. As a maintainer, I want every precedence chain `ergon new` walks, in both
   modes, to live in one module, so that the mode split ADR 0001 describes can
   be read in one file.
2. As a maintainer, I want to test an Interactive and a Non-interactive
   `ergon new` in-process, past the first Jira call, so that a bug in how
   resolution is wired is caught by a test rather than a user.
3. As a maintainer, I want a test to fail loudly if a Non-interactive run ever
   reaches a prompt, so that ADR 0014's "never prompts" is checked rather than
   trusted.
4. As a maintainer, I want the Cache read-through written once, so that a fifth
   cached lookup does not need a fifth copy of the branches.
5. As a person at a terminal, I want `ergon new` to prompt, pre-select and
   remember exactly as it does today, apart from the three fixes below.
6. As an agent, I want `ergon new --sprint "Sprint 5"` to work without a
   terminal, as `ergon edit --sprint "Sprint 5"` already does, so that I can
   file an issue straight into a named Sprint.
7. As a person at a terminal, I want `ergon new --sprint "Sprint 5"` to find the
   Sprint without asking me which board, as `edit` does.
8. As a person at a terminal who picks an Epic at the prompt, I want the new
   issue to Inherit the Epic's labels, and to be offered its Client SOW as the
   default, as a script passing `--epic` already does.
9. As a person at a terminal, I want a Parent with no labels to fall through to
   the project's configured labels, as a Non-interactive run already does, and
   to be asked for labels only when nothing is left.

## Implementation Decisions

### The module

- Lives in `src/commands/new_issue.ts` and exports `fileNewIssue(draft, deps)`.
  The name avoids a clash with `JiraClient.createIssue`. It absorbs
  `new_fields.ts`. No new glossary term is needed: the module is named after
  what it does, in words the glossary already has.
- **Starts** with the parsed flags, the Description already read and checked,
  config, Remembered state and `interactive`.
- **Ends** after `createIssue`: it returns the created issue and the next
  `ErgonState`, including the updated Cache. The create step belongs inside
  because the next state needs the new key, and a test asserts the exact create
  payload the fake received.
- **Stays in the action:** `planSource`, `readSource` and `assertExpressible`,
  which must run before any prompt per
  [ADR 0012](../docs/adr/0012-a-file-flag-only-where-stdin-is-contended.md);
  `parseAssignee`, which refuses a bad flag before any IO; building the
  adapters; `saveState`; printing `Created KEY: summary`.
- `resolveFields`, `rememberCreated`, `parentFieldsFrom`,
  `requireClientSowFieldId` and the `ClientSowPlan` type become internals and
  are no longer exported. `isNoneValue`, `parseLabels`, `parseAssignee` and
  `assigneeField` stay exported, because `edit` uses them.
- Interactive and Non-interactive take the same code path. The mode shows only
  where Remembered state is read or written and in which Prompter is passed.

### The Prompter

- One method per question, each taking the domain values it chooses among and
  returning the answer as a domain value: `project(projects)`, `epic(epics)`,
  `summary()`, `parentQuery(types)`, `parent(matches)`, `labels(available)`,
  `clientSow(options, default)`, `board(boards)`, `sprint(sprints)`.
- The choice of "None" in a select is returned as `undefined`. The `__none__`
  sentinel values stay inside the cliffy adapter.
- The parent search splits in two: `parentQuery` asks for a key or search text,
  the module runs `jira.search`, and `parent(matches)` asks for a pick. Jira
  stays behind the port; the Prompter only asks.
- The cliffy adapter keeps the option-building of today's `promptProject`,
  `promptLabels`, `promptClientSow`, `promptSprintBoard`, `promptSprint` and
  `promptParentIssue`, including the sorting and search settings.
- The Non-interactive adapter throws on every method, naming the method. Any
  call is a bug, since every Non-interactive path must already be settled by
  flags, the Parent or config.

### The Jira port

- A structural interface with `listEpics`, `listLabels`, `getFieldOptions`,
  `listBoards`, `listActiveSprints`, `search`, `getIssueFields`,
  `getMyAccountId` and `createIssue`, each with `JiraClient`'s signature.
  `JiraClient` is passed as-is.
- Typing `getIssueFields`' raw result, and moving field-id knowledge into the
  client, is candidate #3 of the architecture review and out of scope here.

### The Cache decorator

- Wraps `listEpics`, `listLabels`, `getFieldOptions` and `listBoards`, and
  passes the rest through. It reads from and writes to a copy of `state.cache`,
  and exposes the result so the module can put it into the next state.
- `--no-cache` uses the undecorated port and leaves `state.cache` as it was, as
  today.
- Two calls deliberately bypass it, as today: resolving the Active Sprint reads
  boards straight from Jira ("the cached ones carry no board type"), and
  `listActiveSprints` is never cached, since an Active Sprint is a fact with a
  shelf life (glossary: Cache).
- The Cache is saved only after a successful create, as today.

### The three fixes

- **`--sprint <name>`.** `parseSprint` and `SprintTarget` move from
  `src/commands/edit_fields.ts` into `src/sprint.ts`, and `new` parses its flag
  with them. `none`, a numeric id, `active` and a name resolve as in `edit`: a
  name goes through `resolveSprintId({ name })` over the project's boards, or
  the configured `sprintBoardId`, in both modes, without prompting. The "needs
  interactive mode" refusal and the name branch of `promptSprint` go. With no
  `--sprint` on an Interactive run, the board and sprint prompts stay.
- **Inherit from the Epic in both modes.** The key Inherited from is
  `parentKey ?? epicKey` whatever the mode. An Interactive run that picks an
  Epic gets the Epic's labels without a label prompt, and the Epic's Client SOW
  as the prompt's default, ahead of Remembered state.
- **An empty labels array is nothing to Inherit, in both modes.** Labels resolve
  from `--labels`, then the Parent's non-empty labels, then the configured
  labels. An Interactive run prompts only if none of those yields any.

### Docs

- ADR 0001: replace the 2026-11-24 note's "gated inline… search for
  `state.last`" with a pointer to `fileNewIssue`, the one place both directions
  of the mode split now live.
- `CHANGELOG.md`, under Fixed: the three fixes, one entry each.
- `NOTES.md`: the decisions above and the progress tracker.
- `README.md`: `--sprint` on `new` accepts a name without a terminal.
- The `jira` skill should learn that `ergon new --sprint <name>` works
  Non-interactive. That is the user's own edit; the change summary flags it.

### Order of work

On `refactor/new-issue-module`, branched from `develop`, four commits, each
passing `deno task check`:

1. `refactor`: the module, the adapters and tests at its interface, with no
   behaviour change. The ADR 0001 note goes in here.
2. `fix`: Inherit from an Epic in an Interactive run.
3. `fix`: an empty labels array is nothing to Inherit.
4. `fix`: `--sprint <name>` on `new` resolves like `edit`, in both modes.

Each fix carries its CHANGELOG entry. Rebuild `~/.local/bin/ergon` at the end.

## Testing Decisions

- **The interface is the test surface.** Tests call `fileNewIssue` with a fake
  Jira port, a scripted Prompter, a config and a state, and assert on three
  things only: the payload passed to `createIssue`, the returned next state, and
  which Prompter methods were called. Nothing tests past the interface.
- **Fakes.** The Jira fake answers from fixtures and records every call; the
  scripted Prompter answers in order and fails on an unexpected question. The
  existing `ActiveSprintSource` fakes in `tests/board_order_test.ts` are the
  shape to copy.
- **Replace, don't layer.** Every `resolveFields` and `rememberCreated` scenario
  in `tests/new_fields_test.ts` becomes a `fileNewIssue` test in a new
  `tests/new_issue_test.ts`, in each mode where it applies. Then the old tests
  are deleted, along with the exports. The tests of `isNoneValue`, `parseLabels`
  and the Client SOW field refusal move or stay with whatever still exports
  them.
- **Commit 1 changes no behaviour.** Its tests pin today's behaviour, including
  the three drifts. Each fix then flips the pinned test: red first, then green.
  - Fix 2: an Interactive run that picks an Epic, with no `--parent`, calls
    `getIssueFields` on the Epic. It creates with the Epic's labels and never
    calls `labels()`, and `clientSow()` receives the Epic's SOW as its default.
  - Fix 3: an Interactive run whose Parent has `labels: []` and whose project
    configures labels creates with the configured labels and never calls
    `labels()`. With nothing configured it still calls `labels()`.
  - Fix 4: a Non-interactive run with `--sprint "Sprint 5"` creates with that
    Sprint's id. An Interactive one does too, and never calls `board()` or
    `sprint()`. An unknown name fails with the `resolveSprintId` message.
- **New coverage the old seam could not reach:**
  - A Non-interactive run never calls the Prompter.
  - `--no-cache` leaves `state.cache` untouched.
  - A cached epic list is not refetched.
  - The Active Sprint resolves from uncached boards.
  - A failed create writes no state.
- `tests/main_test.ts` keeps its subprocess refusals (`--project`, `--summary`);
  they test the action's wiring, which the module tests do not.
- **Not automated:** the cliffy adapter itself, which needs a pty. Manual check:
  run `ergon new` at a terminal through each prompt — project, Epic, summary,
  parent search, labels, Client SOW, board, Sprint — and confirm each appears
  and pre-selects as before.

## Out of Scope

- Typing the Inherit read and moving field ids into `JiraClient` (architecture
  review candidate #3).
- Routing `edit` and `comment` stdin through the Source module (candidate #4).
- A shared command context for every action (candidate #5).
- Changing what `ergon new` prompts for, or adding a prompt.
- Editing the `jira` or `worktime` skills.

## Further Notes

- Decisions were reached in an architecture review on 2026-11-24 (candidate #1
  of six). Candidate #2, sharing `--sprint` between `new` and `edit`, is folded
  in here as fix 4.
- `ergon new` remains the only command whose stdin is contended (ADR 0012).
  Keeping Source reading in the action, ahead of the module, preserves that.
