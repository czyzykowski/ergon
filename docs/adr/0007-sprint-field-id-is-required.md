# Sprint field id is required

[ADR 0002](./0002-no-default-client-sow-field-id.md) removed the hard-coded
fallback for the Client SOW field id and then, in its Consequences, deliberately
declined to do the same for the sprint field:

> The decision covers Client SOW alone. `DEFAULT_SPRINT_FIELD_ID` still defaults
> in `src/commands/new.ts`, which is deliberate rather than an oversight — no
> discovery command depends on the sprint field's semantics, so it has not
> earned the same strictness yet.

It has now earned it, and on exactly the condition that paragraph named.
`ergon
ls --json` and `ergon get --json` report an issue's Sprints, so reading
the sprint field is no longer incidental to creating an issue — it is a thing
ergon claims to know. A guess that happens to be right in one Jira is not a
basis for that claim, and ADR 0002's reasoning about what a wrong id does
applies unchanged: Jira omits unknown custom fields rather than erroring, so a
guessed id that matches nothing reports an issue with no Sprints rather than
failing.

`defaults.projects.<KEY>.fields.sprintFieldId` is therefore required, and
`DEFAULT_SPRINT_FIELD_ID` is deleted. A project declared in config must name it,
and that is checked when the config is loaded rather than when the field is
first touched, so the failure arrives on the next run of any command and names
the key to add.

The strictness stops at the edge of what config declares. `ergon ls` with no
`--project` searches every project the operator is assigned in, including ones
config has never heard of — a ticket raised in a project you have never worked
in is precisely the ticket a morning sweep most needs to surface. Erroring there
would let one stray issue blank a list of twenty. So a project that config does
not mention is not an error: its Sprints are **Absent**, per
[ADR 0006](./0006-absent-means-not-fetched.md), and the sweep continues.

The rule is thus about the difference between a claim and a question. An
invocation that _names_ a project is asserting that project is one ergon is
configured for, and a missing id makes that assertion false — `ergon new`,
`ergon ls --project PGR`. A search that merely _encounters_ a project is
asserting nothing.

`clientSowFieldId` stays optional. ADR 0002 reasoned that a project which never
sets a Client SOW needs no configuration, and nothing here disturbs that — an
undeclared id gives an Absent `clientSow`, which is honest and costs its one
consumer nothing.

## Consequences

Every project declared under `defaults.projects` must now name a
`sprintFieldId`, and existing installs will fail on the next command until they
do. The failure is at config load, names the key and the project, and is
therefore a one-line fix.

`ergon new` no longer works against a project with no configuration at all. That
convenience was the thing ADR 0002 traded away for Client SOW, and it is traded
away here for the same reason.

ADR 0002's Consequences paragraph quoted above is superseded. The rest of ADR
0002 stands, including its decision about Client SOW.
