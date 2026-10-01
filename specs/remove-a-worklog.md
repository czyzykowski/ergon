# Remove a Worklog

## Problem Statement

ergon can write time three ways and read it one way, and cannot unwrite it at
all. `ergon log` posts a Worklog to Jira, `ergon start`/`ergon stop` drive
Clockwork's timer, and `ergon worklogs` reads the day back from Jira per
[ADR 0008](../docs/adr/0008-jira-is-the-record-of-logged-time.md). When one of
those entries is wrong, the only fix is the Jira UI.

Wrong entries are routine rather than exceptional. A timer left running through
lunch, two hours logged against the Story when they belonged on its sibling, a
stray minute from a mis-started timer, and — most importantly — an hour the
`wrapup` skill proposed because the day looked uncovered, logged on top of an
hour that was already there. That last one is the failure ADR 0008 was written
to prevent, and ergon now detects it without being able to do anything about it.

The gap is sharper than "a missing command", because the read side cannot even
name the thing that is wrong. `Worklog` is
`{issueKey, started, timeSpentSeconds,
description}` — Jira returns an `id` on
every entry and ergon discards it. So nothing ergon prints or emits identifies a
Worklog, and no fix could be scripted even if the write path existed.

## Solution

A Worklog becomes nameable, and a new verb removes one.

```
ergon worklogs                     # now with an id column
ergon unlog PGR-11 45231
```

`ergon worklogs` grows an id column immediately after the issue key, so the two
tokens `ergon unlog` takes are adjacent and in the order they are typed.
`Worklog` gains `id`, which `--json` carries, so `wrapup` can propose removals
as well as additions.

`ergon unlog` takes an issue key and a worklog id, both required. It reads the
issue's Worklogs first, so it can refuse with its own error rather than relaying
Jira's, verify the entry is the operator's own, and print what it removed:

```
Removed 2h on PGR-11 at 09:00 (45231): Reviewed the migration
```

Corrections are a **Removal** followed by a fresh `ergon log`. ergon does not
amend a Worklog in place even though Jira's API would allow it — see
[ADR 0011](../docs/adr/0011-a-worklog-is-removed-and-re-logged.md).

**Removal** enters ergon's language as the mirror of Replacement: the deletion
of a whole record rather than a rewrite of its content, unguarded because naming
the record by its own id _is_ the guard.

## User Stories

1. As an operator, I want to remove a Worklog I logged against the wrong issue,
   so that the ticket's time is not wrong in a client's billing.
2. As an operator, I want to remove the duplicate when `wrapup` logs an hour
   that was already covered, so that the day does not over-report.
3. As an operator, I want to remove the stray entry a mis-started timer left, so
   that the day reads as what happened.
4. As an operator, I want to see the id of each entry in `ergon worklogs`, so
   that I can name the one I mean without opening Jira.
5. As an operator, I want to be told what was removed, so that I can re-log it
   from the output if I removed the wrong one.
6. As an agent, I want `ergon worklogs --json` to carry each entry's id, so that
   I can propose a removal as precisely as I propose a log.
7. As an operator, I do not want ergon to remove a colleague's Worklog, so that
   the one record I cannot see is also one I cannot destroy.

## Implementation Decisions

### Domain

**Removal** is added to `CONTEXT.md` as the mirror of **Replacement**, and
Replacement's own entry is corrected. It had claimed that "only a Replacement
can destroy something Jira cannot restore", which `unlog` makes false. The pair
now states the guarding rule rather than leaving it to be inferred: a
Replacement is guarded because nothing in the invocation names the content it
overwrites; a Removal is not, because the id names the record exactly.

This retro-fits `ergon blocked-by --remove`, which has been an unguarded
destructive act since it shipped with nothing in the language explaining why
that is correct.

### Command surface

`ergon unlog <issueKey> <worklogId>` is a new top-level verb, not a flag.

A flag on `ergon log` was the obvious reading of the `--remove` precedent on
`blocked-by`, and it does not transfer. `--remove` works there because the
command's own positionals — subject and target — fully identify the Link to
remove, so the flag takes no argument. `ergon log`'s positionals are
`<issueKey> <duration>`, and a duration identifies nothing; the flag form would
be `ergon log PGR-11 --remove 45231`, with a required positional silently absent
and an id smuggled in through an option.

`ergon worklogs --delete` was the closer alternative, and was rejected to keep a
command to one subject — the same discipline that kept `ergon status` about the
running timer and gave the breakdown its own command. A destructive flag on a
listing is destructive on the command most often invoked to read.

### Identity

Both tokens are required. `unlog` does not fall back to `state.lastIssueKey`,
unlike `edit`, `comment`, `comments`, `move` and `blocked-by`.

In those commands the issue _is_ the subject, and defaulting a subject to "the
one I was last on" is a convenience. Here the subject is a Worklog and the key
is half of Jira's address for it, so a fallback would be guessing at an
identifier. Concretely: a stale `lastIssueKey` would produce "no such worklog"
for an id that exists, which is the most confusing error available. Both tokens
are read off one line of `ergon worklogs` anyway.

Ids are not positions in the listing. A line number means nothing except
relative to a listing ergon is not holding onto, so a `--date` typo, a timer
stopping between the two commands, or `wrapup` logging in between would silently
repoint it at a different entry — and the act is unrecoverable.

### The receipt

`unlog` reads the issue's Worklogs before deleting, which does three jobs at
once: it finds the entry so the output can describe it, it exposes the author
for the ownership check, and it means ergon never depends on Jira's 404
behaviour for a mismatched id — the "not on this issue" error is ergon's own and
names both halves.

There is no confirmation prompt, and none is wanted. ergon has no "are you sure"
anywhere, and the id is already the deliberate act: it is copied from a listing
seconds earlier, not typed from memory. A prompt would also fork behaviour
across Interactive and Non-interactive for no gain. The receipt is the safety
net instead — it names exactly what to re-log, which is what the
remove-then-re-log workflow leans on.

The window between the read and the delete is left alone. An entry removed in
Jira in between makes the delete fail, which is the correct outcome.

### Authorship

`unlog` refuses a Worklog whose author is not the operator, with no flag to
waive it.

The argument is consistency rather than caution. ergon's reads are scoped to the
operator twice over — `readDay`'s JQL is `worklogAuthor = currentUser()` and
`assembleDay` drops any entry whose `author.accountId` does not match — so every
id ergon has ever printed is the operator's own. Without the check, `unlog`
could destroy records `ergon worklogs` is structurally incapable of showing. The
only ids that can trigger the refusal are ones sourced from outside ergon.

The check reuses `getMyAccountId` and the same accountId comparison
`assembleDay` makes, and costs one request to `/myself`.

No waiver flag: nothing has asked to remove another person's time, a Worklog is
a billing record, and the Jira UI does it fine for the case that never comes.

### Jira parameters

`unlog` sends `notifyUsers=false` and no `adjustEstimate`.

Omitting `adjustEstimate` takes Jira's default, which on a delete _increases_
the remaining estimate by the removed time — the exact inverse of the decrement
`addWorklog` already takes by default on the way in. Remove-then-re-log
therefore cancels out. `adjustEstimate=leave` is the trap, and ADR 0011 records
why.

`notifyUsers=false` is also added to `addWorklog`, so `ergon log` stops
notifying watchers too. This is a change to shipped behaviour and wants its own
CHANGELOG line. Both paths are ergon's own bookkeeping; the watchers of an issue
do not need an email because a timer was corrected.

### Human output

A `worklogs` line becomes `issueKey  id  HH:MM  duration  description`.

The id goes after the key rather than first, departing from `ergon comments`,
which leads with it. A comment thread is about one issue and has no key column,
so there the id is the line's only identifying token; the day reads _by issue_,
and leading every line with an opaque number taxes the common case of scanning
where the hours went. Placing it second also puts the two tokens `unlog` takes
side by side in the order they are typed.

The cost is accepted: `widest()` sizes the columns, so the listing is about
seven characters wider for every reader, in service of a command used rarely.

`unlog`'s own output is one line naming the duration, issue, start time, id and
description, in that order — the description last because it is the only
variable-length part.

### `--json`

`Worklog` gains `id: string`, placed first to match `JiraComment`. The change is
additive, so existing consumers are unaffected, and `--json` on `worklogs` is
the only read contract that changes.

`ergon unlog` has no `--json`. It is a single act with a single outcome, and the
receipt is prose for a human; a machine already knows the id it passed.

### Modules

`JiraWorklogEntry` gains `id` and `started` as required fields, which Jira has
always returned on every worklog; `author` and `comment` stay optional because
profile visibility can hide one and a worklog need not carry the other.
`JiraClient` gains `deleteWorklog(issueKey, worklogId)`, and `worklogPath`
builds both worklog write paths so `notifyUsers=false` and the deliberate
absence of `adjustEstimate` are stated once rather than twice. `author` also
gains `displayName`, which a refusal needs to name whose Worklog it declined.

`assembleDay` carries `id` through from the entry, via a `toWorklog` mapper it
shares with the receipt so a day's breakdown and a Removal describe the same
entry the same way. The ownership check and the entry lookup go in
`src/worklogs.ts` as `requireRemovableWorklog`, a pure function over
`readonly JiraWorklogEntry[]` that answers with the entry or throws — the shape
`requireSprintFieldId` and `assertRewritable` already set, and what AGENTS.md
means by "prefer `throws` and propagate errors upward". `removeWorklog` beside
it orchestrates the read, the gate and the delete over a narrow `WorklogRemover`
interface, so the guarantee that a refusal issues no `DELETE` is provable
against a fake.

`startTime` moves from `src/commands/worklogs.ts` into `src/worklogs.ts`, since
two renderers now read a Worklog's start, and is joined by `startStamp` for the
receipt's dated form.

`src/commands/unlog.ts` registers the command and does the printing.

## Testing Decisions

The pure parts carry the weight, against a fake client the way the existing
worklog tests do.

- `assembleDay` surfaces `id` on every entry, and still filters by author and
  date.
- The lookup returns the entry for an id present on the issue.
- The lookup refuses an id absent from the issue, and the message names both the
  id and the key.
- The lookup refuses an id whose author is not the operator, and names the
  author rather than pretending the entry is missing.
- `renderWorklogs` places the id second, pads it to the widest id, and still
  totals correctly.
- `unlog` issues no DELETE when the lookup refuses. This is the test that
  matters most: a refusal that still deletes is the only unrecoverable bug
  available.
- The DELETE carries `notifyUsers=false` and no `adjustEstimate`, and
  `addWorklog` carries `notifyUsers=false`.

## Out of Scope

- **Amending a Worklog.** No duration, description, start time or issue can be
  changed in place. ADR 0011.
- **Removing another person's Worklog.** Refused outright, with no flag.
- **Removing more than one Worklog per invocation.** No `--all`, no date-range
  removal, no removal by issue. A bulk unrecoverable act is a different feature
  with a different safety story, and nothing has asked for it.
- **Interactive selection.** `ergon unlog` does not list the day and ask which
  entry to remove. The listing already exists as `ergon worklogs`.
- **Removing a Comment.** ergon still cannot, and this does not change that.
- **Clockwork.** Removal goes through Jira, like every other read since
  ADR 0008. `ClockworkClient` is untouched.

## Further Notes

- ergon no longer reads Clockwork worklogs at all —
  `ClockworkClient.getWorklogs` has been unused since ADR 0008 — so removing
  through Jira cannot desync anything ergon reads. Whether Clockwork keeps a
  mirror of its own that would go stale is not knowable from this repo, and is
  unaffected by which of ergon's paths wrote the entry.
- There is no way to tell a Clockwork-originated Worklog from an
  `ergon
  log`-originated one. Clockwork logs as the operator, so provenance is
  invisible to Jira's API and `unlog` could not treat them differently if it
  wanted to.
- Worklog ids are unique instance-wide, so an id alone would in principle
  identify an entry. Finding its issue would take the same JQL-search-then-fetch
  dance `readDay` does, scoped to a date the invocation would have to supply —
  two tokens again, for a request.
- Verify against a throwaway Worklog before building on it: that `DELETE` with a
  valid id on the wrong issue fails rather than succeeding, and that Jira's
  delete default really does restore the remaining estimate. The first is only
  ergon's second line of defence, since the lookup runs first, but the second is
  what ADR 0011's cancellation rests on.
