# Resolve the Current Sprint

## Problem Statement

`ergon new --sprint current` puts a new issue into a Sprint that closed months
ago.

The resolution looks right. `listActiveSprints` asks Jira for the board's
sprints filtered to `state=active`, and the command takes the first. But that
call is made **only on a cache miss**. The board's sprints are written to
`cache.sprints[boardId]` on the first run and never expire, so `current` has
been replaying whatever was active the day the cache was first warmed. With
two-week Sprints it was wrong within a fortnight and has been wrong ever since.

Filtering the cached entries on `state` would not save it: `CachedSprint.state`
is frozen at write time, so the stale record still claims to be active. The
cache does not go stale in a way it can detect.

The root is a domain error, and `CONTEXT.md` named it precisely. **Cache** was
defined as _"Jira metadata saved locally to avoid refetching — epics, labels,
boards, sprints, field options"_. Epics, labels, boards and field options are
durable: they change when someone edits a schema. Which Sprint is active is a
fact with a two-week shelf life. They were filed under one word, and the word's
definition invited it.

There is a second, quieter wrong in the same path. When the project has no
configured `sprintBoardId`, `current` takes `availableBoards[0]` — _"'current'
just needs any board's active sprint; don't prompt."_ Board order is Jira's, and
a project with a delivery board and a triage board gets whichever came back
first, silently. The sibling path five lines below already refuses exactly this
situation when a Sprint is named rather than asked for by keyword.

`ergon edit --sprint current` is about to share this resolver, and `standup`
will call it unattended, so both wrongs are about to run with nobody watching.

## Solution

The active Sprint is fetched, never cached, and `current` refuses to guess which
board it came from.

```
ergon new --sprint current       # always asks Jira which Sprint is active now
ergon edit PCK-12 --sprint current
```

`cache.sprints` is removed. **Cache** is redefined in `CONTEXT.md` to hold only
facts that change when someone changes Jira's configuration — a fact with a
shelf life is never cached, however cheap it would be to keep.

`current` with more than one board and no `sprintBoardId` raises the error the
named-sprint path already raises, naming the fix.

## User Stories

1. As an operator, I want `--sprint current` to mean the Sprint that is active
   now, so that a new issue lands in the iteration I am working.
2. As an operator, I want `--sprint current` to be right on the first run of a
   new Sprint, so that a Sprint boundary does not silently corrupt a fortnight
   of tickets.
3. As an operator, I want a board with no active Sprint to fail, so that an
   issue is not created in a Sprint that does not exist.
4. As an operator, I want `--sprint current` to refuse when several boards could
   answer, so that I am not put into another board's Sprint without knowing.
5. As an operator, I want that refusal to name `sprintBoardId`, so that the fix
   is one config line.
6. As an operator, I want a project with one board to need no configuration, so
   that the refusal costs nothing where there is no ambiguity.
7. As an operator, I want `--sprint current` and `--sprint <name>` to refuse the
   same ambiguity, so that a shorter keyword is not a weaker guarantee.
8. As an operator, I want ergon to keep caching epics, labels, boards and field
   options, so that fixing this costs no interactive speed.
9. As an agent, I want `--sprint current` to resolve correctly in a
   non-interactive run, so that closing a board gap unattended is safe.
10. As an agent, I want the same resolution from `new` and from `edit`, so that
    "current" means one thing in ergon.
11. As a maintainer, I want the board choice to be a pure function with tests,
    so that the refusal is checked without live Jira.
12. As a maintainer, I want `CONTEXT.md` to say what may be cached, so that the
    next volatile fact is not filed beside the durable ones.

## Implementation Decisions

### Domain

**Cache** in `CONTEXT.md` is rewritten to hold only facts that change when
someone changes Jira's configuration, naming this bug as the reason. `sprints`
is dropped from its list of examples.

No ADR. This is a bug fix and a sharpened definition; there is no trade-off
being chosen and nothing surprising to explain to a future reader once the
glossary is right.

### Never cache the active Sprint

- `cache.sprints` is removed from `CacheState`, and the `listActiveSprints`
  result is used directly.
- A TTL was considered and rejected. It introduces time-sensitivity to a
  structure that has none, and any TTL is wrong at a Sprint boundary — which is
  the one moment the answer changes and the one moment it matters.
- Splitting the entry into a durable sprint list and a volatile "which is
  active" was also considered: more machinery than the problem carries, for a
  call `listActiveSprints` already makes cheaply.
- The cost is one request on a command already making several, and only on the
  `--sprint current` path.
- `listActiveSprints` filters `state=active` server-side, so a live call is
  correct by construction. The cache was only ever saving one request.

### Refuse to guess a board

- When `sprintBoardId` is configured, it is used.
- When it is not and the project has exactly one board, that board is used. No
  configuration is needed where there is no ambiguity, which is why
  [ADR 0007](../docs/adr/0007-sprint-field-id-is-required.md) left
  `sprintBoardId` optional.
- When it is not and the project has several, the command raises the error the
  named-sprint path already raises: _"Multiple boards found; set a default
  sprintBoardId or pass a numeric --sprint id."_
- This makes one rule where there were two. A guess is not more acceptable
  because the keyword was shorter, and the existing asymmetry — erroring when a
  Sprint is named, guessing when `current` is asked for — has no reason behind
  it beyond the comment asserting that any board will do.
- Printing the chosen board instead of refusing was considered. It is still
  silently wrong for anyone not reading stderr, and `standup` reads neither.
- Querying every board and accepting a single distinct active Sprint was also
  considered: more correct in the common case where boards share a filter, at N
  requests, to avoid a problem one config line settles permanently.
- The existing `Using active sprint: <name> (<id>)` line on stderr stays, and
  gains the board it came from.

### Shared between `new` and `edit`

- Resolution lives in one place and is called by both commands, so "current"
  means one thing.
- Its shape: a board id or the boards list plus the configured `sprintBoardId`
  in, a sprint id out, raising on ambiguity and on a board with no active
  Sprint.
- `ergon new` takes the project from its own arguments; `ergon edit` takes it
  from the fetched issue. Only the project key differs.
- `--sprint <name>` keeps its existing behaviour, including requiring
  interactive mode. Unchanged by this spec.

## Testing Decisions

A good test here checks the choice, not the fetch. The command modules need live
Jira and are not unit-tested, per the precedent in every prior spec.

One seam:

**Board selection** — the available boards plus the configured `sprintBoardId`
in, a board id out or a raised error.

The removal of the cache is not a seam and has nothing pure to test: it is the
absence of a lookup. It is covered by the board-selection tests only in that
they take sprints as an argument, which is what forces the caller to fetch.

Prior art: `tests/new_fields_test.ts` for a pure decision extracted from `new`;
`tests/config_test.ts` for asserting on error messages.

Cases to cover:

- One board, no configured id: that board.
- Several boards, configured id: the configured one.
- Several boards, no configured id: raises, and the message names
  `sprintBoardId`.
- Configured id not among the project's boards: used anyway, since Jira is the
  authority on whether it is valid and a client-side guard would refuse a board
  the caller is entitled to use — the reasoning `specs/comment-on-issue.md`
  applied to comment permissions.
- No boards at all: raises the existing "No board available to resolve the
  sprint." message.
- A board whose active-sprint list is empty: raises the existing "No active
  sprint found for the board." message.

## Out of Scope

- **Caching with a TTL**, in any form.
- **Removing the other caches.** Epics, labels, boards and field options stay
  cached; they are durable, which is the point of the sharpened definition.
- **`--sprint <name>` resolution.** Unchanged, including its interactive-mode
  requirement.
- **Choosing a board interactively for `current`.** `current` exists to avoid a
  prompt; a prompt would defeat it, and `standup` cannot answer one.
- **Reading an issue's Sprints.** That is `specs/list-issues.md`.
- **A `--board` flag.** `sprintBoardId` in config already answers this, once.
- **Unit tests for the command modules**, which need live Jira.

## Further Notes

- The bug was found while designing `ergon edit --sprint current`, which would
  have inherited both wrongs, and would have run them unattended from the
  `standup` skill.
- Operators who have run `ergon new --sprint current` before should expect
  previously created issues to be in the wrong Sprint. Nothing here corrects
  them; the fix stops it recurring.
- `NOTES.md` should record what may be cached and why, since the glossary entry
  is the guard against the next volatile fact being filed beside the durable
  ones.
- `CHANGELOG.md` gets a `Fixed` entry for `--sprint current` resolving to a
  closed Sprint, and a `Changed` entry for the refusal on ambiguous boards.
- The design behind every decision here was settled in a grilling session before
  any code was written.
