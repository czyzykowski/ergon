# A file flag only where stdin is contended

`-` means stdin on every rich-text flag ergon has: `ergon edit --description -`,
`ergon comment --body -`, and now `ergon new --description -` and
`ergon log --description -`. A `--<field>-file` flag, which names a path
instead, exists on `ergon new` alone. The table in
[rich-text-from-a-source.md](../../specs/rich-text-from-a-source.md) therefore
reads as though three commands were forgotten. They were not.

On a command that never prompts, `--description - < spec.md` already reads a
file. A `--description-file` there would be a second spelling of a shell
redirect — more surface to document, to remember, and to keep true in the skills
that drive ergon, buying nothing. `ergon new` is the only command in the CLI
that prompts, and a prompt needs the same stdin the Source would consume.
Reading stdin there does not merely conflict with prompting, it **hangs**: the
epic prompt waits forever on a stream already at EOF. So `ergon new` is the one
command where stdin is unusable in exactly the case the feature exists for — a
long Description, supplied to a run that still wants to ask about the epic — and
the one command where naming a path earns its keep.

The rejected alternative was uniformity: a `-file` sibling on all four flags, so
that the rule needs no exceptions. `AGENTS.md` makes the cost of CLI surface
unusually explicit — every flag is a line in a skill that goes stale silently —
and that argument cuts toward fewer things to remember, not toward four
spellings of one idea. Two of the four would have done nothing but exist.

## Consequences

A future reader will see `--description-file` on `new` and not on `edit`, and
the obvious "fix" is to add it everywhere. That is the change this ADR exists to
stop. The asymmetry is the decision.

The rule is written against the Source rather than against the flag, so
`--description-file -` is accepted and means stdin — the two flags overlap at
exactly one value. That is deliberate: `-` is the universal spelling for stdin
wherever a path is expected, and a path flag that rejected it would be the
surprise. It also means the refusal of stdin on a prompting run has to be
written against the Source too, or `--description-file -` would hang where
`--description -` does not.

If a command other than `new` ever grows a prompt, it inherits both halves of
this: stdin becomes contended there, and it needs a path flag. Nothing else
about the rule changes, which is why the rule is phrased as a condition rather
than as a list of commands.

## Note (2026-11-24)

"`ergon new` is the only command in the CLI that prompts" was not true when
written: `ergon move` prompts for a transition without `--to`, and `ergon menu`
prompts. Neither reads a rich-text Source, so stdin is not contended there and
the rule above is unaffected. Since
[ADR 0014](./0014-a-run-without-a-terminal-is-non-interactive.md), a run whose
stdin is a pipe is Non-interactive and never prompts, so the hang this ADR
describes can no longer happen through a piped Source.
