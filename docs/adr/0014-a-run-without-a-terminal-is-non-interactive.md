# A run without a terminal is Non-interactive

A run is Interactive only when both stdin and stdout are terminals and
`--non-interactive` was not given. Any other run is Non-interactive, exactly as
if the flag had been passed: it never prompts or opens an editor, it ignores
remembered state, and where it cannot determine something it fails, naming the
flag that would have answered it.

Before this, Non-interactive was opt-in, and a run that forgot the flag did not
fail — it hung. A cliffy prompt against a piped stdin neither throws nor
returns, and `$EDITOR` with no terminal is no better. Every caller that was not
a person at a keyboard therefore had to know, in advance and for each command,
which flags kept ergon from waiting on one: the jira skill carried that list as
a standing warning. ergon can see for itself that nobody is there to answer, so
the knowledge belongs in ergon.

Both ends are checked, not only stdin. Prompts read stdin but draw on stdout, so
`KEY=$(ergon new …)` typed at a terminal would draw its prompt into the captured
output, where nobody sees it — the same hang with a person present.

The rejected alternative was a third mode: detected runs skip prompts but still
read remembered state, so a piped run resolves fields like a typed one. That
would hand back to scripts and agents exactly the dependence on someone's last
click that [ADR 0001](./0001-non-interactive-ignores-remembered-state.md)
removed. There is one Non-interactive, however it was selected.

## Consequences

The same `ergon new` can create a different issue depending on how it was
started: typed at a terminal it may pre-select from remembered state and prompt;
piped, it resolves from flags, the Parent and config alone. That is the point,
not an accident.

`--non-interactive` stays, for a person at a terminal who wants Non-interactive
behaviour — a shell loop creating issues, say. There is no way to force
Interactive without a terminal, since nothing could answer.

`planSource`'s refusal of a stdin Source on an Interactive run is now reachable
only when the Description is typed at the terminal itself; a piped Source makes
the run Non-interactive first.
