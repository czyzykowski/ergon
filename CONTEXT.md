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
the field; leaving `--client-sow` off lets it be inherited. _Avoid_: empty,
null, unset

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
