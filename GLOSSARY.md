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

**Child**: An issue whose Parent is a given issue — the Parent slot read from
the other end. Because each issue has one Parent, an issue's Children belong to
it alone, and the issues below an Epic form a tree rather than a web. Jira's
Parent-Child Link type is not this: it is an ordinary Link, carries no
hierarchy, and is never called a Child here. _Avoid_: subtask, sub-issue,
parent-child link

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

**Active Sprint**: The Sprint Jira marks active, as Jira says at the moment it
is asked — never a remembered answer, because it changes the moment someone
completes the Sprint and a remembered one names a closed Sprint Jira refuses to
write to. It is Jira's flag, not the calendar: it can run past its end date
until someone completes it, and work written to it then carries over with the
rest. Boards that share a Sprint share the answer, so it is one Active Sprint
however many of a project's boards show it. _Avoid_: current sprint, this sprint

**Open Sprint**: A Sprint that is active or future — anything Jira has not
closed. It is the set a Sprint can still be written to, and the set Board order
groups by. Like the Active Sprint it is asked of Jira every time and never
remembered. A closed Sprint still appears in an issue's history, but it is never
open again. _Avoid_: current sprints, upcoming sprints, unfinished sprints

**Rank**: The ordering set by dragging. A Rank is meaningful only within a board
— dragging expresses how two issues on the same board compare and never how an
issue on one board compares to an issue on another — so ordering by Rank across
boards produces an order nobody chose. A board is not a project: one board may
span many projects, and issues from different projects on it are ranked against
each other as deliberately as any two. Rank alone is not what a board shows; see
Board order. See
[ADR 0013](./docs/adr/0013-board-order-belongs-to-the-board.md). _Avoid_:
priority, position

**Done**: Of an issue whose status falls in Jira's Done category — Done and Will
Not Do alike. This is how ergon tells finished work from open work, and the only
way: the workflows it serves never set a resolution, so every issue reads as
unresolved however long ago it closed. _Avoid_: resolved, closed, complete

**Transition**: A change in the status an issue shows, by name — In Progress to
Ready for QA counts though both sit in one category, and so does a move made by
automation or by someone else. A remap that changes the status underneath but
leaves its name alone, as moving an issue between projects can, is not a
Transition: the issue has been waiting in the status a reader sees all along.
How long an issue has sat in its status runs from its last Transition, or from
its creation if it has never had one. _Avoid_: status change, move, workflow
step

**Board order**: The order a board presents its issues in, and what the operator
means by priority: the active Sprint first, then each upcoming Sprint in turn,
then everything in no Sprint, with Rank deciding only within each of those
groups. A highly ranked issue in no Sprint still comes after the least ranked
issue in the active one. Board order follows the board in what it holds as well
as how it sorts: every issue in an Open Sprint, whatever its status, but a Done
issue in no Open Sprint is off the board and so out of Board order. Sprints are
taken in the board's own sequence, whatever their names suggest — a Sprint used
as a parking place is still a Sprint. The Jira Priority field is read and
reported but never ordered by. _Avoid_: rank order, backlog order, priority

**None**: The literal word a flag takes to mean "explicitly empty".
`--client-sow none` clears the field, `--due none` clears the due date. What
_omitting_ the flag means belongs to the command and never to the word — Inherit
on `ergon new`, leave-alone on `ergon edit` — so None says only "make this
empty, deliberately". The convention holds wherever `none` cannot collide with a
real value of the field; a free-text field, where it can, is cleared with an
empty string instead. _Avoid_: empty, null, unset

**Absent**: Of a field ergon has no answer for, as distinct from one it fetched
and found empty. There are three ways to have no answer: ergon did not fetch it
(a Link on an issue from a search), Jira would not say (an author hidden by
profile visibility), or this run did not produce it (the `path` of an Attachment
that was not downloaded). An Absent field is missing from the JSON entirely; an
empty one is `null`. The distinction is what stops "I do not know" reading as
"there is nothing there" — the read side's counterpart to None. See
[ADR 0006](./docs/adr/0006-absent-means-not-fetched.md). _Avoid_: missing,
unset, undefined

**Description**: The free-text body of an issue, and where an agent reads what
the issue asks for. A Description is markdown: read out as markdown, written
back as markdown, and Expressible in both directions — see
[ADR 0010](./docs/adr/0010-markdown-is-ergons-rich-text-format.md). _Avoid_:
body, details, notes

**Degraded**: Of content read out with its text whole but its structure reduced
— a panel that reads as a quote, an Attachment that reads as its filename.
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

**Attachment**: A file stored on an issue and named by an id Jira assigns. Its
content never changes — replacing a file makes a new Attachment with a new id —
so an id names the same bytes for as long as it exists. A Description or Comment
may show an Attachment, but what it shows carries only the filename, never the
id, and a filename need not be unique on an issue. So ergon never claims which
Attachment a Description means; it reports the filename and leaves the matching
to the reader. _Avoid_: file, upload, media

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

**Source**: Where a rich-text value is read from, as distinct from the value
itself. A flag either carries the text inline or names a Source — the path `-`
means stdin, a `--<field>-file` flag means that file. Which Sources a flag
offers is not uniform across commands, and deliberately so: stdin is contended
wherever a run may prompt, because a prompt needs the same stdin and cannot
share it. See
[ADR 0012](./docs/adr/0012-a-file-flag-only-where-stdin-is-contended.md).
_Avoid_: input, origin, target

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
