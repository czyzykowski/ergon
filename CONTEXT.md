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

**None**: The literal word a flag takes to mean "explicitly empty", as distinct
from omitting the flag, which means "decide for me". `--client-sow none` clears
the field; leaving `--client-sow` off lets it be inherited. The convention holds
only for fields with enumerable values, where `none` cannot collide with a real
one — a free-text field is cleared with an empty string instead. _Avoid_: empty,
null, unset

**Description**: The free-text body of an issue, and where an agent reads what
the issue asks for. ergon reads a Description more richly than it writes one:
any Description can be read out, but only one made of plain paragraphs can be
rewritten in place — see
[ADR 0003](./docs/adr/0003-descriptions-are-plain-text.md) and
[ADR 0004](./docs/adr/0004-descriptions-read-richer-than-they-write.md).
_Avoid_: body, details, notes

**Degraded**: Of a Description read out with its text whole but its structure
reduced — a table whose rows survive as lines, a panel that reads as a quote.
Degrading is never silent: whatever was flattened is named alongside the text.
Distinct from the loss ergon refuses on write, which would destroy the text
itself. _Avoid_: lossy, truncated, partial

**Comment**: A dated, authored remark appended to an issue. Comments
accumulate rather than replace: a new one never overwrites the last, and editing
one corrects a past utterance rather than restating what the issue currently
asks for. Distinct from a Description, which is the issue's current statement of
itself and is rewritten in place. _Avoid_: note, remark, update

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
boards, sprints, field options. Distinct from Remembered state: a Cache holds
facts about Jira, Remembered state holds the operator's past choices. _Avoid_:
store, snapshot
