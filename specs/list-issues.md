# List Issues as Data

## Problem Statement

`ergon ls` prints one line per issue — key, status, summary — sorted by
`updated DESC`. That is the right answer for a human glancing at a terminal and
the wrong one for everything else.

The `standup` skill orders the operator's day from the Jira board, on the stated
principle that the board is the single source of priority. It reads Jira only
through ergon, and ergon cannot see the signals that carry priority. There is no
way to ask for the board's own order. There is no due date, no Sprint, no
Priority, no Client SOW in the issue JSON. The skill's workaround is to call
`ergon get --json` once per issue key it scraped out of `ls`'s text, which is
one request per issue to recover structure that the search already returned and
threw away — and even then the fields it wants are not in the shape. Until this
lands the skill reports "rank unavailable" and falls back to `updated` order,
which is to say it orders the day by what was touched most recently rather than
by what matters most.

The gap is not only about ordering. A morning sweep is also meant to notice
board gaps — a ticket being worked that is not in the Sprint, a deadline living
in prose because no due date was ever set. It cannot notice what it cannot read.

## Solution

`ergon ls` grows a data mode, an ordering, and a bound, and the issue shape
grows the four fields that carry priority.

```
ergon ls --json
ergon ls --project PCK --order rank
ergon ls --sprint --json
ergon ls --since 2026-09-17 --json
```

`--json` emits an array of the same `JiraIssue` that `ergon get --json` emits,
one element per issue, replacing one-request-per-key with one request.

`--order rank|updated` selects the ordering. `updated` stays the default. `rank`
emits `ORDER BY Rank ASC` and requires `--project`, because a Rank means nothing
across boards — see [ADR 0009](../docs/adr/0009-rank-does-not-cross-boards.md).

`--since YYYY-MM-DD` adds `updated >= "<date>"`, bounding a sweep to issues that
have moved.

Every issue, from `ls` or from `get`, gains `priority`, `dueDate`, `sprints` and
`clientSow`. A **Sprint** is a term in ergon's language now, and so is **Rank**,
and so is **Absent** — the last being the rule that keeps this shape honest: a
field ergon did not fetch is missing from the JSON, and `null` is reserved for a
field it fetched and found empty.

## User Stories

1. As an agent, I want a list of issues as JSON, so that I can reason about them
   without parsing a display format.
2. As an agent, I want that JSON to be the same shape `ergon get --json` gives
   me, so that one parser handles both.
3. As an agent, I want one request for a list of issues, so that a morning sweep
   is not twenty round trips.
4. As an agent, I want the array to preserve the query's ordering, so that
   position in the array carries the same meaning as position in the list.
5. As an agent, I want an empty result to be an empty array, so that "no issues"
   is data rather than a sentence I have to recognise.
6. As an operator, I want `ergon ls` with no `--json` to print exactly what it
   prints today, so that adding a data mode costs me nothing.
7. As an agent, I want each issue's Priority, so that I can report what Jira
   thinks the urgency is.
8. As an agent, I want each issue's due date, so that I can tell a deadline from
   a preference.
9. As an agent, I want each issue's Sprints, so that I can tell whether a ticket
   is in the iteration being worked.
10. As an agent, I want the full list of an issue's Sprints rather than one
    chosen for me, so that a ticket carried over and a ticket planned ahead are
    distinguishable.
11. As an agent, I want a ticket planned into a future Sprint not to look like a
    ticket in no Sprint at all, so that I do not propose dragging next week's
    work into this week.
12. As an agent, I want each issue's Client SOW, so that I can say what a ticket
    is billed against.
13. As an agent, I want to order a project's issues the way its board is
    ordered, so that I can plan a day from the operator's own priorities.
14. As an operator, I want `--order rank` to refuse a query spanning projects,
    so that I am never shown an order I did not choose while being told it came
    from my board.
15. As an operator, I want that refusal to name the fix, so that I know to pass
    `--project`.
16. As an operator, I want `updated` to stay the default ordering, so that every
    existing invocation behaves as it did.
17. As an operator, I want `--sprint` not to silently change my ordering, so
    that a flag's effect does not depend on which other flags are present.
18. As an agent, I want to bound a list to issues updated since a date, so that
    a comment scan costs a handful of requests rather than one per open ticket.
19. As an agent, I want `--since` to take a plain date, so that I never have to
    reason about which timezone a boundary was interpreted in.
20. As an agent, I want a field ergon did not fetch to be missing rather than
    empty, so that "I did not look" never reads as "there is nothing there".
21. As an agent, I want `null` to mean the field was fetched and was empty, so
    that an empty value is a fact I can act on.
22. As an agent, I want `links` absent from a listed issue, so that I do not
    conclude an issue has no Links when nobody asked Jira about them.
23. As an agent, I want an issue from a project ergon is not configured for to
    still appear in the list, so that a ticket raised somewhere new is not
    invisible on the morning it arrives.
24. As an agent, I want that issue's Sprints to be Absent rather than empty, so
    that I report a configuration gap rather than a board gap.
25. As an operator, I want a project I have declared in config to be declared
    completely, so that a half-configured project fails loudly instead of
    reporting empty fields.
26. As an operator, I want that failure at config load, so that I learn about it
    on the next command rather than the next time the field is touched.
27. As an operator, I want the failure to name the project and the key, so that
    the fix is a single line.
28. As an operator, I want `ergon ls --project PGR` to fail when PGR is
    undeclared, so that naming a project asserts ergon is configured for it.
29. As a maintainer, I want the issue mapping to be a pure function with tests,
    so that the `--json` contract is enforced without live Jira.
30. As a maintainer, I want the JQL builder to be a pure function with tests, so
    that ordering and scoping rules are checked without live Jira.

## Implementation Decisions

### Domain

- **Sprint**, **Rank** and **Absent** are added to `CONTEXT.md`. **Cache** is
  sharpened to say it holds only facts that change when Jira's configuration
  changes, which is what the stale-sprint bug in
  `specs/resolve-current-sprint.md` turned out to be about.
- Three ADRs carry the reasoning:
  [0006](../docs/adr/0006-absent-means-not-fetched.md) (Absent vs `null`),
  [0007](../docs/adr/0007-sprint-field-id-is-required.md) (the sprint field id
  is required, superseding ADR 0002's sprint exception), and
  [0009](../docs/adr/0009-rank-does-not-cross-boards.md).

### The issue shape

One `JiraIssue`, emitted by both commands. `ls --json` is an array of it;
`get
--json` is one of it. There is no second type — an Issue is an Issue, and
what differs is how much of it was fetched.

Four new fields:

- `priority` — the Priority name, or `null`. Read, reported, never ordered by:
  the operator's priority is expressed by dragging, which is Rank.
- `dueDate` — Jira's `duedate`, an ISO date string, or `null`.
- `sprints` — an array of `{name, state}` in the order Jira returns them, or
  Absent when the project has no `sprintFieldId` that ergon knows.
- `clientSow` — the option's display value, or `null`, or Absent when the
  project has no `clientSowFieldId` declared.

`sprints` is a list and not a chosen one. The obvious alternative — "the active
Sprint, or the most recent" — was rejected twice over. "Most recent" is
undefined among closed Sprints, since Jira's array order is board order rather
than chronology, so the rule would need a tiebreak invented for it. Worse, the
projection destroys the one distinction its consumer most needs: a ticket in a
`future` Sprint has no active Sprint, so it would report the same as a ticket in
no Sprint, and a skill looking for board gaps would propose dragging
deliberately deferred work into the current iteration.

### Absent versus null

Per ADR 0006. A key that is not present means ergon did not fetch the field. A
key whose value is `null` means ergon fetched it and Jira had nothing.

- `links` is Absent from any issue that came from a search. `issuelinks` is
  deliberately not added to `SEARCH_FIELDS`: closing the gap would make every
  list fetch link graphs for up to `--limit` issues to satisfy a symmetry no
  caller consumes.
- `sprints` and `clientSow` are Absent for a project whose field id ergon does
  not know, which after the config rule below means a project config has never
  heard of.
- Everything in `SEARCH_FIELDS` is always present, `null` when empty.

This does not distinguish a _wrongly_ configured field id from an empty field.
Jira omits unknown custom fields rather than erroring, as ADR 0002 records, so
that case is indistinguishable by construction and Absent claims nothing about
it.

### Configuration

Per ADR 0007. `sprintFieldId` is required for every project declared under
`defaults.projects`, checked when config is loaded, and the error names the
project and the key. `DEFAULT_SPRINT_FIELD_ID` is deleted from the `new` command
— under this rule it is unreachable.

`clientSowFieldId` stays optional. ADR 0002 reasoned that a project which never
sets a Client SOW needs no configuration, and reading the field does not change
whether it exists in a given project's schema.

Naming a project asserts ergon is configured for it, so `ergon ls --project PGR`
errors when PGR is undeclared. Encountering a project asserts nothing, so an
unscoped search that happens to return an issue from an unknown project returns
it with those fields Absent. The distinction is the difference between a claim
and a question, and it is what stops one stray ticket blanking a sweep of
twenty.

### Ordering

- `--order <rank|updated>`, defaulting to `updated`. `updated` emits
  `ORDER BY updated DESC` as today; `rank` emits `ORDER BY Rank ASC`.
- `--order rank` without `--project` is an error naming `--project` as the fix.
  Per ADR 0009.
- `--sprint` does not imply `--order rank`. The implication was considered —
  sprint order _is_ rank order within a board — and rejected because `--sprint`
  spans projects: the default would either contradict ADR 0009 or fire only when
  `--project` happened to be present, which is an ordering that changes with an
  unrelated flag and cannot be stated in one line of `--help`.
- An unrecognised `--order` value is an error listing the two accepted ones.

### `--since`

- `--since YYYY-MM-DD` adds `updated >= "YYYY-MM-DD"`, ANDed with the rest.
- Date granularity only. JQL does not accept an ISO-8601 instant, and the repair
  — translating one to `"yyyy-MM-dd HH:mm"` — requires the Jira user's timezone,
  which ergon does not hold and which JQL applies to bare date-times. An
  off-by-one-timezone boundary silently drops the earliest hours of the window,
  which for a morning sweep is the comments left the night before. A bare date
  is resolved by Jira in the operator's own timezone, which is the one they
  meant.
- Same format as `edit --due`, so the CLI has one date shape.
- A malformed value is rejected by ergon with its own message rather than
  forwarded to Jira as a broken query.
- The premise is sound: commenting bumps an issue's `updated` in Jira, so
  `updated >=` has no false negatives as a filter for "might have new comments".
  It has false positives — an issue updated for an unrelated reason is scanned —
  which cost a request each and mislead nobody.

### Output

- `--json` prints the array with `JSON.stringify(issues, null, 2)`, matching
  `get --json`.
- An empty result prints `[]` under `--json`, and keeps `No issues found.`
  without it. A sentence is right for a human and wrong for a parser.
- Human output is untouched.

### Modules

- `mapIssue` in the Jira client becomes **exported**. It was private while its
  output was read by a human; it is the `--json` contract now, and this repo's
  rule is that contracts get tests — the line `mapComment` crossed for the same
  reason, and the comment above `mapComment` explaining why is updated to stop
  citing `mapIssue` as the counterexample.
- `mapIssue` takes the project's field ids as an argument rather than reaching
  for config, so it stays pure and so Absent is decidable inside it.
- `buildJql` in the `ls` command becomes **exported**, taking options and
  returning the JQL string. It is already pure.
- `SEARCH_FIELDS` gains `priority`, `duedate`, and — per project — the sprint
  and Client SOW field ids. Because those vary by project, the field list is
  built per search from the projects config rather than being a module constant;
  the constant becomes the fixed part of that list.
- `config.ts`'s `validateRequired` gains the declared-project rule. No new seam:
  the function and its tests already exist.
- `types.ts` gains `JiraSprint` in the `{name, state}` shape the issue carries,
  distinct from the richer `JiraSprint` the agile API returns.

## Testing Decisions

A good test here exercises what a caller receives — the mapped object, the JQL
string — not how the client assembled it. Command modules are not unit-tested;
they need live Jira, which is the precedent in `specs/move-issue-status.md`,
`specs/edit-issue.md` and `specs/comment-on-issue.md`. So the testable parts are
pulled into pure functions first, as `resolveFields` and the ADF helpers were.

Three seams, two of them new:

1. **`mapIssue`** — raw Jira issue JSON plus the project's field ids in, a
   `JiraIssue` out. The `--json` contract, and the seam that matters most.
2. **`buildJql`** — options in, JQL string out. Ordering, scoping and `--since`
   rules.
3. **Config validation** — the existing seam in `config.ts`, widened.

Prior art: `tests/comments_test.ts` tests `mapComment` as a contract;
`tests/new_fields_test.ts` tests `resolveFields` as a pure precedence rule;
`tests/config_test.ts` already covers config validation failures.

Cases to cover:

- An issue with a Priority, a due date, Sprints and a Client SOW, all mapped.
- An issue whose Priority and due date are empty, mapping to `null` rather than
  being Absent.
- An issue from a project with no known `sprintFieldId`, whose `sprints` key is
  Absent — asserted as key absence, not as `undefined`, since the two differ
  once serialised.
- The same for `clientSow` with no declared `clientSowFieldId`.
- An issue carried over, mapping to three Sprints with two `closed` and one
  `active`, in Jira's order.
- An issue with only a `future` Sprint, which must not map to the same thing as
  an issue with none.
- An issue with an empty sprint array, mapping to `[]` — fetched and empty,
  distinct from Absent.
- A search-sourced issue, whose `links` key is Absent.
- A `get`-sourced issue, whose `links` key is present.
- `buildJql` with `--order rank` and `--project`, emitting `ORDER BY Rank ASC`.
- `buildJql` with `--order rank` and no project, throwing, with the message
  naming `--project`.
- `buildJql` defaulting to `ORDER BY updated DESC`, including with `--sprint`,
  which must not change the ordering.
- `buildJql` with `--since`, emitting the `updated >=` clause ANDed in.
- `buildJql` with a malformed `--since`, throwing.
- Config validation rejecting a declared project with no `sprintFieldId`, naming
  both, and accepting one with no `clientSowFieldId`.

## Out of Scope

- **Writing Priority.** The operator orders by dragging, which is Rank. A
  `--priority` write would offer a second, competing way to say the same thing.
- **Writing Rank.** Reordering a board from a CLI is a different feature with a
  different interface — relative to what, above which issue — and no stated
  need.
- **`--fields` or `--links` on `ergon ls`.** Letting the caller opt into
  expensive fields was considered and rejected as configurability nobody asked
  for; Absent already tells them what they did not get.
- **A second issue type for listed issues.** Considered; rejected in ADR 0006.
  One word for one thing.
- **`comments --since`.** Bounding the comment scan is done by bounding the
  issue list, because round trips dominate and a per-issue filter would trim
  payload while leaving the call count untouched.
- **Timezone-aware `--since`.** Deferred rather than refused; if minute
  granularity ever matters, the timezone fetch is the whole of the work.
- **Sprint dates.** `startDate`/`endDate` are available on the agile field and
  are not carried. `state` answers every question the consumer has.
- **Resolving which Sprint is "current".** That is the `new`/`edit` write path,
  specified in `specs/resolve-current-sprint.md`.
- **Unit tests for the command modules**, which need live Jira.

## Further Notes

- `scripts/sweep.py` in the `standup` skill folder is the first consumer and
  should be simplified once this lands: one `ls --json` per project replaces one
  `get --json` per key.
- `standup` must state its own cross-project merge rule now that ergon refuses
  to invent one — Sprint, then due date, then Rank within a project is the
  obvious shape, and it is the skill's decision to make and explain.
- One fact was not verifiable from this repo when the spec was written: nothing
  in ergon reads the sprint field today, `new` only writes it, and there are no
  fixtures. That the field reads back as an array of sprint objects is knowledge
  of Jira Cloud's agile field rather than something the codebase demonstrates.
  It should be confirmed with a single authenticated read before the `sprints`
  mapping is written, and the response captured as the test fixture.
- `CHANGELOG.md` gets `Added` entries for `--json`, `--order` and `--since` and
  the new fields, and a `Changed` entry for the config requirement, which is
  breaking for existing installs.
- `README.md`'s listing section gains the new flags.
- The design behind every decision here was settled in a grilling session before
  any code was written; the reasoning is recorded inline rather than left to be
  rediscovered.
