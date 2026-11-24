# Non-interactive runs ignore remembered state

`ergon new` fills a field by walking a precedence chain: the flag, then the
Parent's value, then the project's configured default. Interactive runs insert
remembered state into that chain — `state.lastClientSow` pre-selects the Client
SOW prompt — and it was tempting to let non-interactive runs read it too, so
both modes would resolve fields identically. We deliberately do not.

Remembered state is a record of what a human last picked at a prompt. Reading it
non-interactively would make a script's output depend on the operator's personal
shell history: two people running the same command against the same Jira would
get different issues, and a scheduled run would get whichever SOW someone
happened to click last. The failure is invisible — the issue is created
successfully, just wrong. Flags, the Parent, and config are all deterministic
inputs, so restricting non-interactive mode to those keeps `ergon new`
reproducible.

The rule is symmetric, and the write direction matters as much as the read: a
non-interactive run must not write `state.lastClientSow` either. A value
inherited from a Parent was never selected by anyone, so recording it as the
last selection would corrupt the meaning of the field and leak into the next
interactive prompt.

## Consequences

The precedence chain differs by mode, which looks like an oversight if you meet
it in the code without this context. Resolution therefore lives in one pure
function, `resolveFields` in `src/commands/new_fields.ts`, which takes
`interactive` as an explicit input so the divergence is visible in one place and
covered by tests.

## Note (2026-11-24)

The rule now covers `state.lastProject` and `state.lastEpic` too, not only
`state.lastClientSow`. `ergon new` used to default the project from
`lastProject` and record both values in every mode, which became visible once
every run without a terminal turned Non-interactive: a script that omitted
`--project` filed its issue wherever the operator last worked. A Non-interactive
run now resolves the project from `--project`, then config, and writes neither.
The writes are settled in one pure function, `rememberCreated` in
`src/commands/new_fields.ts`. `state.lastIssueKey` is not Remembered state in
this sense — it is the default key for follow-up commands such as `ergon edit`,
not a prompt's pre-selection — and is still written in every mode.
