# ergon

A personal CLI over Jira and Clockwork. Its job is to make the routine parts of
issue tracking and time logging fast from a terminal, and scriptable when they
need to run unattended.

## Language

### Issue hierarchy

**Parent**: The issue an issue hangs from. Jira exposes exactly one such link,
so an Epic and a Story compete for the same slot — an issue does not have "an
epic _and_ a parent", it has one Parent that may happen to be either. _Avoid_:
parent ticket, container

**Epic**: The Parent chosen from a project's epic list rather than searched for
by key. It is a way of _picking_ a Parent, not a second kind of link. _Avoid_:
initiative, theme

**Link**: A named, directional relation between two issues that carries no
hierarchy — an issue may have many, or none. Distinct from Parent, which is a
single slot and drives Inherit; a Link never does. ergon writes two kinds and
reads every kind Jira reports — see
[ADR 0005](./docs/adr/0005-one-command-per-writable-link-type.md). _Avoid_:
relation, reference, connection

**Phrase**: How a Link reads from one end — `is blocked by` from one side,
`blocks` from the other. One Link has two Phrases; which one ergon shows depends
on which issue you asked about. _Avoid_: type, direction, label

**Blocked**: The workflow status named Blocked, which is what `ls --blocked`
filters. Not the same as carrying an `is blocked by` Link — an issue can have
either without the other, and ergon never infers one from the other. _Avoid_:
stuck, waiting

**Inherit**: To take a field's value from the Parent when the invocation did not
supply one. Inheritance is a fallback, never an override — anything given
explicitly wins. _Avoid_: copy, propagate, cascade

### Fields

**Client SOW**: The statement of work an issue is billed against. A
single-select Jira custom field whose id varies per project, so it is always
referred to by configured field id rather than by name. _Avoid_: SOW value,
contract, engagement

**Sprint**: A named, time-boxed iteration on a board. An issue carries a
_history_ of them rather than a slot: a ticket carried over twice reports three,
and one planned ahead reports a Sprint it is not yet working in. This is the
mirror of Parent, which is one slot and nothing more. ergon reports the history
and leaves the reading of it to the caller, because "the" Sprint of an issue is
a question only the caller can answer. _Avoid_: iteration, cycle, milestone

**Rank**: The board's own ordering, the one set by dragging. A Rank is
meaningful only within a board — dragging expresses how two issues on the same
board compare and never how an issue on one board compares to an issue on
another — so ordering by Rank across boards produces an order nobody chose. It
is what the operator means by priority; the Jira Priority field is read and
reported but never ordered by. See
[ADR 0009](./docs/adr/0009-rank-does-not-cross-boards.md). _Avoid_: priority,
position, backlog order

**None**: The literal word a flag takes to mean "explicitly empty".
`--client-sow none` clears the field, `--due none` clears the due date. What
_omitting_ the flag means belongs to the command and never to the word — Inherit
on `ergon new`, leave-alone on `ergon edit` — so None says only "make this
empty, deliberately". The convention holds wherever `none` cannot collide with a
real value of the field; a free-text field, where it can, is cleared with an
empty string instead. _Avoid_: empty, null, unset

**Absent**: Of a field ergon did not fetch, as distinct from one it fetched and
found empty. An Absent field is missing from the JSON entirely; an empty one is
`null`. The distinction is what stops "I did not look" reading as "there is
nothing there" — the read side's counterpart to None, and the reason a Link
never appears on an issue that came from a search. See
[ADR 0006](./docs/adr/0006-absent-means-not-fetched.md). _Avoid_: missing,
unset, undefined

**Description**: The free-text body of an issue, and where an agent reads what
the issue asks for. A Description is markdown: read out as markdown, written
back as markdown, and Expressible in both directions — see
[ADR 0010](./docs/adr/0010-markdown-is-ergons-rich-text-format.md). _Avoid_:
body, details, notes

**Degraded**: Of content read out with its text whole but its structure reduced
— a panel that reads as a quote, an attachment that reads as its filename.
Degrading is never silent: whatever was flattened is named alongside the text.
Strictly a read-side word. Nothing is Degraded on write, because a construct
ergon cannot express is refused rather than reduced. To be Degraded and to be
Expressible are opposites: what reads out whole is what can be written back.
_Avoid_: lossy, truncated, partial

**Expressible**: Of a construct ergon carries in both directions — markdown it
can turn into ADF, and ADF it can turn back into that same markdown. One set
rather than two, deliberately: what ergon writes is defined to be what it reads
without Degrading, so the two directions cannot drift apart. Markdown outside
the set is refused rather than approximated, and carries no override — the draft
is the caller's own and can simply be rewritten. _Avoid_: supported, convertible

**Replacement**: A write that overwrites existing content rather than creating
it — editing a Description, editing a Comment. A Replacement is guarded because
nothing in the invocation names the content it is about to destroy, and Jira
cannot restore it. Creating an issue or adding a Comment has nothing to
overwrite and is never guarded. The mirror of Removal, which destroys a whole
record and needs no guard. _Avoid_: update, overwrite, edit

**Removal**: The deletion of a whole record rather than a rewrite of its content
— a Link unlinked, a Worklog unlogged. A Removal is never guarded, because
naming the record by its own id is the guard: an id is read off a listing rather
than typed from memory, and one that names nothing on the issue refuses instead
of removing a neighbour. The mirror of Replacement, which overwrites content in
place and is guarded precisely because nothing names what it overwrites.
_Avoid_: delete, destroy, drop

**Comment**: A dated, authored remark appended to an issue. Comments accumulate
rather than replace: a new one never overwrites the last, and editing one
corrects a past utterance rather than restating what the issue currently asks
for. Its body is markdown on the same terms as a Description. Distinct from a
Description, which is the issue's current statement of itself and is rewritten
in place. _Avoid_: note, remark, update

### Time

**Worklog**: A record of time spent on an issue. Jira holds them, and every way
of creating one ends there — Clockwork's timer writes a Worklog, `ergon log`
writes a Worklog, and so does anyone typing into the Jira UI. Jira is therefore
the only vantage point from which a day is whole, which is why ergon reads time
from Jira even though it writes it through Clockwork — see
[ADR 0008](./docs/adr/0008-jira-is-the-record-of-logged-time.md). Distinct from
a Comment, which records what happened rather than how long it took. _Avoid_:
time entry, log, timesheet

### Invocation

**Interactive**: A run permitted to prompt. It may ask the operator to resolve
anything it cannot determine, and it may read and write remembered state.
_Avoid_: manual, human mode

**Non-interactive**: A run that must never prompt, selected with
`--non-interactive`. It resolves every field from flags, the Parent, and config
alone, so that the same command against the same Jira produces the same issue
for anyone who runs it. _Avoid_: headless, scripted, batch

**Remembered state**: Values persisted from a previous Interactive run to
pre-select later prompts, such as the last Client SOW chosen. It records what a
human picked, so it is Interactive-only in both directions — see
[ADR 0001](./docs/adr/0001-non-interactive-ignores-remembered-state.md).
_Avoid_: cache, history, session

**Cache**: Jira metadata saved locally to avoid refetching — epics, labels,
boards, field options. A Cache holds only facts that change when someone changes
Jira's configuration. A fact with a shelf life is never cached, however cheap it
would be to keep: which Sprint is active was cached once and went on being
reported as current for months. Distinct from Remembered state: a Cache holds
facts about Jira, Remembered state holds the operator's past choices. _Avoid_:
store, snapshot
