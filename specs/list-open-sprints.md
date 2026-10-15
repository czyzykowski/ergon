# List a Project's Open Sprints

## Problem Statement

`--sprint` on `ergon new` and `ergon edit` takes a Sprint's id, an active
Sprint's name, `active` or `none`, and nothing in ergon says which ids exist.
The only view of a project's Sprints is the Interactive picker in `ergon new`,
which an agent cannot use and which shows active Sprints only.

So an agent that has to put an issue into next week's Sprint has nowhere to read
the id from, and the name it might guess is refused: `--sprint <name>` matches
among active Sprints only, and `ergon new` refuses a name outright when
Non-interactive. The last time an id was needed it was copied by hand into a
skill, and that copy went on naming a closed Sprint.

## Solution

```
ergon sprints <PROJECT> [--json]
```

lists the project's Open Sprints, asked of Jira at the moment of the run:

```
ID    STATE   NAME          START       END         BOARDS
1329  active  Oct 12 - 16   2026-10-12  2026-10-19  PCK Sprint Board (373), Unified Client Board (26)
1330  future  Oct 19 - 23   2026-10-19  2026-10-26  Unified Client Board (26)
```

`--json` is an array of
`{ id, name, state, startDate, endDate, boards: [{ id, name }] }`.

## User Stories

1. As an agent, I want the ids `--sprint` accepts, so that I can put an issue in
   an upcoming Sprint without a prompt.
2. As an agent, I want the listing fetched every run, so that no id I read from
   it names a Sprint closed since.
3. As an operator, I want to see which Sprint is active, so that I know what
   `--sprint active` will resolve to.
4. As an operator, I want each Sprint's boards, so that I can choose a
   `sprintBoardId` when `--sprint active` refuses several active Sprints.
5. As an operator, I want a project with nothing planned to list nothing
   successfully, and a project without Sprints at all to fail, so that "nothing
   now" and "never" read differently.
6. As an operator who hits a `--sprint` refusal, I want it to point at
   `ergon sprints`, so that the fix is one command away.

## Implementation Decisions

- **Open Sprints only.** Active and future; a closed Sprint cannot be written
  to, which is what the listing is for.
- **The project is a required positional**, checked with
  `requireDeclaredProject`, as `client-sows` takes it. Sprints are per project
  because the boards are, and `--sprint` writes within one project.
- **Every scrum board of the project is asked**, kanban boards skipped by
  `type`. A configured `sprintBoardId` is ignored: the listing reports what
  exists, a numeric `--sprint` writes whatever the board config says, and a
  listing confined to the configured board could not help check that board.
- **Each Sprint once**, with every board that shows it. Boards sharing a Sprint
  are the normal case (26, 373 and 439 all show the PCK/PGR Sprint).
- **Order**: active Sprints first, then future; within each, a Sprint stands
  where it first appears, walking the boards in Jira's order for the project.
  Each board answers in its own sequence, so one board — or boards sharing their
  Sprints — read in that sequence, as Board order does.
- **Dates**: `null` in `--json` where Jira has none (fetched and empty, not
  Absent); raw ISO instants otherwise. The table shows the operator's local day,
  and `—` for none.
- **No scrum board** refuses: `No scrum board on PCK; it has no sprints.` No
  Open Sprint is an empty, successful listing: `No open sprints on <boards>.`,
  and `[]` with `--json`.
- `listOpenSprints` on the client returns full Sprint records, paged;
  `listOpenSprintIds`, which Board order uses, maps over it.
- `--sprint` help on `new` and `edit` says a name must be an active Sprint's and
  points at `ergon sprints`; `Active sprint "X" not found.` and
  `Several active sprints: …` end with
  `Run 'ergon sprints <PROJECT>' to see open sprint ids.`

## Testing Decisions

- `scrumBoards` and `listOpenSprints` in `tests/sprint_test.ts`, against a
  stand-in source: dates or `null`, one Sprint shared by two boards, the
  active-first first-appearance order, an empty listing, a kanban-only project.
- `renderSprints` in `tests/sprints_test.ts`: the table and the empty message.
  Instants are at midday UTC so the local day is the same wherever tests run.
- The resolver's refusals now assert the hint.

## Out of Scope

- **Naming a future Sprint in `--sprint`.** `--sprint <name>` still matches
  active Sprints only, on both commands, and `ergon new` still refuses a name
  when Non-interactive. Widening it to Open Sprints through `listOpenSprints` is
  the follow-up; until then a future Sprint is written by id.
- Closed Sprints, Sprint goals, and the issues in a Sprint
  (`ergon ls --sprint`).

## Outcome

Shipped as specified. Run against PCK it lists seven Open Sprints across boards
439, 373 and 26, including the parking-place Sprints (`To Be Estimated`,
`Non-Sprint (Do Not Use)`) — they are Sprints, and they are open.
