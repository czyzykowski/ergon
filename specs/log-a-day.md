# Read a Day's Logged Time

## Problem Statement

`ergon status` answers two questions at once: is a timer running, and how much
have I logged today. The second answer is wrong, and wrong in a way nothing in
the output admits.

ergon writes time two ways. `ergon start` and `ergon stop` drive Clockwork's
timer. `ergon log` posts a worklog to Jira. It reads time one way: Clockwork's
worklog endpoint. So every hour logged with `ergon log` is missing from
`todaySeconds`, and time typed straight into the Jira UI has never been visible
to ergon at all.

The second problem is that the total is only a total. The `wrapup` skill
reconstructs a day and proposes worklogs for the hours not yet covered, which
needs today's time broken down by issue, with start times and descriptions.
`status --json` has never offered that, even though the request it already makes
returns it and then discards everything but the sum.

Together these are worse than either alone. A partial total feeding an
uncovered-hours calculation turns every `ergon log` entry into an hour that
looks unlogged, and the proposal is to log it again. The error runs toward
over-reporting client time.

## Solution

Jira becomes the place a day is read from, and the breakdown gets its own
command.

```
ergon worklogs
ergon worklogs --date 2026-09-17
ergon worklogs --json
```

`ergon worklogs` lists the Worklogs on a date, defaulting to today, as a
per-issue breakdown. `--json` gives the same thing as data.

`ergon status` keeps its own subject — the running timer, and today's total —
and gets that total from Jira, so it finally counts everything. It does not grow
a `--date`: a timer is a live thing, and a command whose central fact is "what
is running now" cannot sensibly be asked about last Tuesday.

A **Worklog** becomes a term in ergon's language: a record of time spent on an
issue, held by Jira, which every way of creating one ends up writing to. See
[ADR 0008](../docs/adr/0008-jira-is-the-record-of-logged-time.md).

## User Stories

1. As an operator, I want today's total to include time I logged with
   `ergon
   log`, so that the number is the number.
2. As an operator, I want today's total to include time I logged in the Jira UI,
   so that ergon's view of my day matches Jira's.
3. As an operator, I want to see today's time broken down by issue, so that I
   can tell where the hours went rather than only how many there were.
4. As an operator, I want each entry's start time, so that I can see the shape
   of the day and not just its size.
5. As an operator, I want each entry's description, so that I can recognise what
   a block of time was.
6. As an operator, I want to ask about a past date, so that fixing Friday's time
   on Monday is possible.
7. As an operator, I want the date to default to today, so that the common case
   needs no argument.
8. As an operator, I want a day with no time logged to say so plainly, so that
   an empty day is distinguishable from a failure.
9. As an operator, I want a malformed date rejected with ergon's own message, so
   that I am not reading a Jira query error.
10. As an agent, I want a day's Worklogs as JSON, so that I can compute which
    hours are uncovered.
11. As an agent, I want each Worklog's issue key, so that I can attribute time
    without a second lookup.
12. As an agent, I want durations in seconds, so that I am not parsing a
    human-formatted string.
13. As an agent, I want start times passed through as Jira gave them, so that no
    timezone is applied on my behalf.
14. As an agent, I want only my own Worklogs, so that a shared issue's other
    contributors do not appear as my hours.
15. As an agent, I want only the requested date's Worklogs, so that an issue
    worked over several days does not inflate one of them.
16. As an agent, I want the breakdown and the total to come from the same
    reading, so that they cannot disagree.
17. As an operator, I want `ergon status` to still tell me what timer is
    running, so that the command keeps its subject.
18. As an operator, I want `ergon status` not to take a date, so that I am never
    shown a timer field that cannot mean anything.
19. As an operator, I want `ergon worklogs` in the interactive menu, so that I
    can find it without reading `--help`.
20. As a maintainer, I want the day's assembly to be a pure function with tests,
    so that filtering by author and date is checked without live Jira.

## Implementation Decisions

### Domain

- **Worklog** is added to `CONTEXT.md`: a record of time spent on an issue, held
  by Jira, distinct from a Comment, which records what happened rather than how
  long it took.
- [ADR 0008](../docs/adr/0008-jira-is-the-record-of-logged-time.md) records that
  Jira is where a day is read from, and why Clockwork remains where a timer is
  written.

### Where a day is read from

Jira, per ADR 0008. Clockwork is a Jira app and its timers land as Jira
worklogs, so Jira sees both of ergon's writers and the one it does not own.
Clockwork sees one.

Two alternatives were weighed. Routing `ergon log` through Clockwork unifies
ergon's own two paths, leaves Jira-UI time invisible, and depends on a
worklog-create endpoint ergon's client does not use. Reading both and
reconciling adds a matching rule that exists only to be got wrong if Jira is a
superset.

The mechanism is a JQL search for the issues carrying this author's worklogs on
the date, then a worklog fetch per issue found, filtered to author and date.
Jira's worklog API is per-issue; there is no global by-user-by-date read. A
normal day is a handful of requests where there was one, paid by `status` and
`worklogs`, neither of which is on a hot path.

Author identity comes from the authenticated user rather than from
`config.jira.email`. Jira Cloud omits `emailAddress` from user objects under
default profile-visibility settings, so comparing against the configured email
is unreliable — the same reason `specs/comment-on-issue.md` gave for not
guarding comment edits client-side.

### Command surface

- `ergon worklogs [--date YYYY-MM-DD] [--json]`. A flat verb, plural, sitting
  beside `comments`, `labels` and `client-sows` as a read-only command.
- `--date` defaults to today. Same date format as `edit --due` and `ls --since`,
  so the CLI has one date shape, and rejected by ergon with its own message when
  malformed.
- No issue key argument. `ergon worklogs` answers "what did I log", and a
  per-issue question is answerable from the output.
- `menu` gains `Show worklogs` → `worklogs`.
- `status` is unchanged in surface: no `worklogs` array, no `--date`. Embedding
  the breakdown was the handoff's other option and stops being equivalent once
  the reader takes a date, because `status --date` would have to emit a `timer`
  field that is absent or a lie for any day but today. The command's central
  fact does not survive the parameter. This is the shape
  [ADR 0005](../docs/adr/0005-one-command-per-writable-link-type.md) argued for
  elsewhere: one command per thing, rather than one command with a mode flag
  that changes what its fields mean.

### The Worklog shape

```json
[
  {
    "issueKey": "PCK-12",
    "started": "2026-09-17T09:14:00.000+0100",
    "timeSpentSeconds": 3600,
    "description": "Paired on the redirect bug"
  }
]
```

- A bare array, matching `comments --json`, `labels --json` and
  `client-sows --json`.
- `started` is Jira's own timestamp, passed through unparsed, as `get --json`
  already does with `created` and `updated`.
- `timeSpentSeconds` rather than a formatted duration; formatting belongs to the
  human path.
- `description` is the worklog comment rendered to text, or `null` when there is
  none. Worklog comments go through the same `renderAdf` the rest of ergon uses.
- Ordered by `started`, earliest first, so array order is the order of the day.
- No worklog id. Nothing in scope edits or deletes a Worklog, and
  `specs/comment-on-issue.md` set the precedent that an id is carried when a
  later operation needs to name the thing.

### Human output

```
PCK-12  09:14  1h 00m  Paired on the redirect bug
PCK-12  11:02  0h 45m  Reviewed the fix
PGR-4   14:30  2h 15m  Sprint planning

Total: 4h 00m
```

- Times as `HH:MM`, durations through the existing `formatDuration`, matching
  the split `get` and `comments` already make between raw JSON and rendered
  text.
- One line per Worklog rather than one per issue. Two blocks on the same ticket
  at different times of day are two facts.
- A total line, because the question "and how much is that" always follows.
- An empty day prints `No worklogs found.`, matching `ls`, `labels` and
  `comments`.
- A Worklog with no description prints its first three columns and nothing else.

### `status`

- `todaySeconds` and `todayFormatted` keep their names and meanings and start
  being correct.
- The Clockwork worklog read is replaced by the Jira read. `ClockworkClient`
  keeps `getWorklogs`; nothing in ergon calls it afterwards, and it is left in
  place rather than removed as unrelated cleanup.
- The `timer` field is untouched. A running timer is Clockwork's and is not a
  Worklog until it stops, which is why Jira cannot report it.
- `status` stops doing its own filtering and summing. Both move into the shared
  seam below, so the total and the breakdown cannot disagree.

### Modules

- `JiraClient` gains a day read: the JQL search for issues with this author's
  worklogs on a date, and the per-issue worklog fetch.
- A pure exported function assembles the day — raw Jira worklog payloads, an
  author id and a date in, an ordered `Worklog[]` out, filtered to that author
  and that date. Both `worklogs` and `status` consume it, which is what makes
  the two numbers one number.
- `types.ts` gains `Worklog`. `ClockworkWorklog` stays for the timer path.
- The renderer is a pure exported function in the `worklogs` command module,
  taking `Worklog[]` and returning the display string, as the thread renderer is
  in `comments`.

## Testing Decisions

A good test here exercises what the caller receives — the assembled day, the
rendered block — not how the client fetched it. Command modules need live Jira
and are not unit-tested, per the precedent in every prior spec, so the logic
worth testing is pulled into pure functions.

Two seams, one feeding the other:

1. **The day assembly** — raw Jira worklog payloads plus an author and a date
   in, `Worklog[]` out. This is the `--json` contract and the source of
   `status`'s total.
2. **The renderer** — `Worklog[]` in, display string out.

Prior art: `tests/comments_test.ts` for a contract-shaped mapping plus a
renderer over it; `tests/adf_test.ts` for the description rendering being reused
here.

Cases to cover:

- A day's worklogs mapping to the array shape, earliest first.
- Worklogs by another author on the same issue, filtered out.
- Worklogs by this author on an adjacent date, filtered out — the case an issue
  worked across several days produces.
- A worklog with no comment, mapping `description` to `null`.
- A worklog whose comment holds formatting, rendering to text through the same
  path the rest of ergon uses.
- An empty day mapping to `[]` and rendering as `No worklogs found.`
- The total over a rendered day equalling the sum of its entries, which is the
  property that keeps `status` and `worklogs` in agreement.
- Two Worklogs on one issue at different times staying two entries.

## Out of Scope

- **Writing Worklogs.** `ergon log` and the Clockwork timer are unchanged. ADR
  0008 is about where a day is read from.
- **Editing or deleting a Worklog.** No stated need, and no id is carried.
- **A date range.** `--date` takes one day. `wrapup` reconstructs a day.
- **Per-issue worklog history.** `ergon worklogs` answers "what did I log", not
  "what has anyone ever logged on this ticket".
- **Reconciling Jira and Clockwork.** Considered in ADR 0008 and rejected; Jira
  is a superset.
- **Removing `ClockworkClient.getWorklogs`.** It becomes unused, which is noted
  rather than acted on.
- **A `--user` flag.** ergon reads the authenticated user's own time.
- **Unit tests for the command modules**, which need live Jira.

## Further Notes

- The `wrapup` skill is the consumer and the reason the breakdown exists: it
  proposes worklogs for uncovered hours, so a partial reading causes double
  logging rather than a wrong display.
- `NOTES.md` should record that ergon now writes time through Clockwork and
  reads it from Jira, since the asymmetry looks like an oversight until ADR 0008
  is read.
- `CHANGELOG.md` gets an `Added` entry for `ergon worklogs` and a `Fixed` entry
  for `status` totals having omitted `ergon log` time.
- `README.md` gains a worklogs section following the shape of the existing
  status section.
- The design behind every decision here was settled in a grilling session before
  any code was written.
