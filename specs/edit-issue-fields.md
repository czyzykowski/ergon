# Edit an Issue's Fields

Supersedes the parts of [edit-issue.md](./edit-issue.md) concerned with when the
editor opens and when the Description is fetched. Everything else in that spec
stands.

## Problem Statement

`ergon edit` writes two fields, summary and description, and it is built around
the description. Every invocation fetches the current Description, runs the ADF
round-trip check over it, and — unless `--description` was supplied — opens
`$EDITOR` on it.

That was a reasonable shape while the description was the point. It is the wrong
shape for anything else, and two things now need to be edited that are not
prose.

The `standup` skill finds board gaps: a deadline living in a Description because
no due date was ever set, a ticket being worked that is outside the Sprint. It
can see those gaps once `ergon ls --json` reports the fields, and it cannot
close them, because `ergon edit` writes summary and description and nothing
more.

Adding `--due` and `--sprint` to the command as it stands does not work.
`ergon edit PCK-12 --due 2026-09-20` would open `$EDITOR` on the Description
before touching the date, which an unattended skill cannot answer. Worse, the
round-trip check runs unconditionally, so setting a due date on an issue whose
Description contains a table would be refused on
[ADR 0003](../docs/adr/0003-descriptions-are-plain-text.md) grounds — over a
field the invocation never mentioned.

Both problems already exist in a smaller form: `ergon edit PCK-12 --summary "x"`
opens the editor today, and fails on a rich Description. The new flags make them
unavoidable rather than merely surprising.

## Solution

One rule, statable in a sentence: **name a field and `edit` writes that field;
name none and it opens the Description.**

```
ergon edit PCK-12 --due 2026-09-20
ergon edit PCK-12 --due none
ergon edit PCK-12 --sprint current
ergon edit PCK-12 --sprint none
ergon edit PCK-12 --summary "Fix the redirect"      # no editor, as of now
ergon edit PCK-12                                   # opens $EDITOR, as before
```

The Description is fetched, and ADR 0003's refusal is applied, only when the
Description is actually in play. A write that does not touch it does not consult
it.

`none` clears a field, which is the existing **None** convention — restated in
`CONTEXT.md` around collision rather than enumerability, so that it covers a
date.

## User Stories

1. As an agent, I want to set an issue's due date from one command, so that I
   can close a deadline gap I just reported.
2. As an agent, I want to put an issue into the current Sprint from one command,
   so that I can close a board gap I just reported.
3. As an agent, I want a field write never to open an editor, so that an
   unattended run cannot hang.
4. As an agent, I want a field write not to be refused because of a Description
   I am not touching, so that a ticket with a table is editable.
5. As an operator, I want `ergon edit --summary` to stop opening my editor, so
   that naming a field means writing that field.
6. As an operator, I want a bare `ergon edit` to still open the Description, so
   that the command I use most is unchanged.
7. As an operator, I want to clear a due date, so that a deadline that no longer
   applies can be removed rather than only moved.
8. As an operator, I want to take an issue out of its Sprint, so that deferring
   work does not mean opening a browser.
9. As an operator, I want `none` to mean the same thing everywhere, so that
   clearing a date and clearing a Client SOW look alike.
10. As an operator, I want a malformed date rejected by ergon, so that I am not
    reading a Jira validation error.
11. As an operator, I want `--sprint current` to mean the Sprint that is active
    now, so that "current" is not a value frozen months ago.
12. As an operator, I want `--sprint current` to refuse when the project has
    more than one board and none is configured, so that I am not silently put
    into another board's Sprint.
13. As an operator, I want to be told which fields were written, so that the
    output is a receipt I can check.
14. As an operator, I want an invocation that changes nothing to say so, so that
    a no-op is visible.
15. As an operator, I want to combine field flags in one command, so that
    closing two gaps is one write.
16. As an operator, I want `--force` still rejected when no Description is
    supplied, so that the ADR 0003 carve-out is not widened by accident.
17. As an operator, I want `--force` rejected when I am only writing a field, so
    that a flag meaning "destroy something deliberately" is never a silent
    no-op.
18. As a maintainer, I want the decision about what an invocation writes to be a
    pure function with tests, so that the rule is checked without live Jira.

## Implementation Decisions

### The rule

An invocation is a **field write** if any of `--summary`, `--description`,
`--due` or `--sprint` is given. It is an **editor invocation** if none is.

- A field write opens no editor and writes exactly the fields named.
- A field write fetches the Description only when `--description` was supplied,
  and applies `assertRewritable` only then.
- An editor invocation behaves as [edit-issue.md](./edit-issue.md) describes:
  fetch, check, render, open `$VISUAL` or `$EDITOR`.

This narrows ADR 0003's refusal to what it was written for. That ADR refuses to
_flatten a Description_; refusing to set a due date because of an untouched
table is the refusal escaping its own scope. Nothing about ADR 0003 changes —
its guard simply stops firing on writes that cannot trigger the loss it guards
against.

The alternative was an opt-out flag, `--no-edit` or similar, preserving today's
behaviour exactly. It puts the burden on every caller forever, and forgetting it
hangs an unattended run on `$EDITOR` — a failure with no output and no timeout.
A separate command for field writes was also considered and rejected: it is a
second command for two scalar fields, where restructuring the existing control
flow is smaller and leaves the CLI with one verb for "change this issue".

### `--due`

- `--due <YYYY-MM-DD|none>` writes Jira's `duedate`.
- `none` clears it, sending `null`.
- Same date format as `ls --since`, so the CLI has one date shape.
- A malformed value is rejected by ergon with its own message rather than
  forwarded.
- No relative forms. `--due friday` is a parser and a timezone question for a
  field that is written rarely and deliberately.

### `--sprint`

- `--sprint <current|none|id|name>` writes the project's sprint field.
- `current` resolves to the board's active Sprint at the moment of the write.
  The resolution is shared with `ergon new` and is specified in
  [resolve-current-sprint.md](./resolve-current-sprint.md), including its
  refusal to choose among several boards and the reason it is never cached.
- `none` clears the field.
- A numeric value is taken as a sprint id. A name is matched among the board's
  active Sprints. `ergon new` requires interactive mode for that because it may
  have to prompt for a board; `edit` has no non-interactive mode and refuses an
  ambiguous board outright, so the lookup is deterministic and needs no prompt.
- The project's `sprintFieldId` comes from config and is required per
  [ADR 0007](../docs/adr/0007-sprint-field-id-is-required.md). `edit` names an
  issue rather than a project, so the project key comes from the fetched issue;
  a project config does not declare is an error here, because the invocation is
  asking ergon to write a field it cannot locate.

### `none`

`CONTEXT.md`'s **None** entry is restated. The old wording defined `none`
against Inherit — "as distinct from omitting the flag, which means decide for
me" — which is `ergon new`'s opposition, not `ergon edit`'s, where omitting a
flag means leave it alone. It also restricted the convention to "fields with
enumerable values", a proxy one notch tighter than the reason it cited: the
actual test is whether `none` can collide with a real value, and it cannot
collide with a `YYYY-MM-DD`.

The restatement says `none` means "make this empty, deliberately", licensed
wherever it cannot be mistaken for a real value, and leaves what _omission_
means to the command. No behaviour changes for any existing flag.

### `--force`

Unchanged in meaning, narrowed in reach. It applies only to `--description`, and
the existing error — `"--force applies only to --description."` — now also
covers a field write that supplies `--force` with no `--description`. The editor
carve-out from ADR 0003 stands: `--force` on an editor invocation is an error.

### Receipts

```
Updated PCK-12 (due)
Updated PCK-12 (description, summary, due, sprint)
No changes for PCK-12
```

Fields are named in a fixed order — description, summary, due, sprint — matching
the existing behaviour of naming only what was sent.

### Modules

- A pure exported function decides what an invocation writes: options in, a plan
  out saying which fields are to be written, whether the editor opens, and
  whether the Description must be fetched. This mirrors `resolveFields` in
  `new_fields.ts`, which is the precedent for pulling a decision out of a
  command module so it can be tested.
- The command module consumes the plan. Its control flow becomes a branch on the
  plan rather than a chain of conditionals over `options.description`.
- Sprint resolution is shared with `ergon new` rather than duplicated; see
  [resolve-current-sprint.md](./resolve-current-sprint.md).

## Testing Decisions

A good test here checks what an invocation decides to do, not how the command
module is written. The command itself needs live Jira and is not unit-tested,
per the precedent in [edit-issue.md](./edit-issue.md) and
`specs/move-issue-status.md`.

One seam:

**The field plan** — options in, a plan out: fields to write, editor or not,
fetch the Description or not.

Prior art: `tests/new_fields_test.ts` tests `resolveFields` as exactly this kind
of pure decision.

Cases to cover:

- `--due` alone: writes `duedate`, no editor, no Description fetch.
- `--summary` alone: writes `summary`, no editor, no Description fetch — the
  behaviour change from [edit-issue.md](./edit-issue.md).
- `--description` alone: writes `description`, no editor, Description fetched.
- No flags: editor, Description fetched.
- Several field flags together: all named in the plan, in the receipt's order.
- `--due none` and `--sprint none` planning a clear rather than a write.
- A malformed `--due` rejected.
- `--force` with `--description`: allowed.
- `--force` with `--due` only: rejected.
- `--force` with no flags: rejected, per the ADR 0003 carve-out.
- A plan that writes nothing, producing the no-change path.

## Out of Scope

- **Any field beyond due date and Sprint.** Labels, Client SOW, Epic, Parent and
  assignee stay with `ergon new`; status stays with `ergon move`. This spec adds
  the two fields a board gap is made of.
- **Writing Priority or Rank.** Ordering is done by dragging; see
  [ADR 0009](../docs/adr/0009-rank-does-not-cross-boards.md).
- **`--json` output.** A mutation's output is a receipt, not data. The exception
  `ergon comment` made was about an id the caller could not otherwise learn; no
  id is minted here.
- **Relative dates.** `--due friday` and similar.
- **Editing a field through the editor buffer.** The buffer remains
  Description-only.
- **Changing ADR 0003.** Its refusal is unchanged; it simply stops firing where
  there is nothing to flatten.
- **Unit tests for the command module**, which needs live Jira.

## Further Notes

- Two of [edit-issue.md](./edit-issue.md)'s ticked criteria stop being true:
  _"Every invocation fetches the description before writing"_ and _"The editor
  path edits description only; summary is unreachable without its flag"_ — the
  second survives in spirit, since the editor still edits only the Description,
  but `--summary` no longer reaches the editor path at all. That file is left as
  the record of what shipped, with a pointer here.
- `CHANGELOG.md` gets `Added` entries for `--due` and `--sprint` and a `Changed`
  entry for `--summary` no longer opening the editor, which is user-visible
  behaviour someone may be relying on.
- `README.md`'s editing section gains the two flags and the one-sentence rule.
- The design behind every decision here was settled in a grilling session before
  any code was written.
