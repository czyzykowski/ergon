# Non-interactive Without a Terminal

## Problem Statement

Non-interactive is opt-in today. A run that forgets `--non-interactive` on
`ergon new`, leaves `--to` off `ergon move`, or gives `ergon edit` or
`ergon comment` no body does not fail when nobody is at a terminal: it hangs. A
cliffy prompt against a piped stdin neither throws nor returns (measured in
`NOTES.md`), and `$EDITOR` opened without a terminal is no better. The caller
sees no output at all until something kills the process.

So every caller that is not a person at a keyboard has to know, ahead of time
and command by command, which flags keep ergon from waiting on one. The `jira`
skill carries that knowledge as a standing warning ("ergon prompts or opens
`$EDITOR`, hanging this session, when a write lacks its body flags: pass
`--non-interactive` to `new` and a body to `edit` and `comment`"). That is ergon
behaviour repeated in a document that goes stale silently, and it exists only
because ergon cannot tell that nobody is there to answer. It can.

## Solution

ergon decides for itself whether a run is Interactive: only when both stdin and
stdout are terminals and `--non-interactive` was not given. Every other run is
Non-interactive, exactly as if the flag had been passed — it never prompts or
opens an editor, it ignores Remembered state
([ADR 0001](../docs/adr/0001-non-interactive-ignores-remembered-state.md)), and
where it cannot determine something an Interactive run would have asked for, it
fails at once with a message naming the flag that would have answered it.

A person at a terminal sees no change. A script or agent never hangs: it either
completes or gets a one-line error telling it what to pass. The decision and its
rejected alternatives are recorded in
[ADR 0014](../docs/adr/0014-a-run-without-a-terminal-is-non-interactive.md).

## User Stories

1. As an agent driving ergon, I want `ergon new` to be Non-interactive without
   my passing `--non-interactive`, so that I need not remember a flag whose only
   purpose is to stop ergon waiting on me.
2. As an agent, I want `ergon new` with no project resolvable to fail with
   "Project key is required; pass --project", so that I can retry correctly in
   one step instead of hanging at a project prompt.
3. As an agent, I want `ergon new` with no summary to fail naming `--summary`,
   so that the failure tells me the fix.
4. As an agent, I want `ergon move <key>` without `--to` to fail naming `--to`,
   so that a forgotten flag costs one error rather than a hung session.
5. As an agent, I want `ergon move` without `--to` to fail before calling Jira,
   so that the refusal is immediate and does not depend on the network.
6. As an agent that does not know the issue's transitions, I want an unknown
   `--to` to keep listing the available transitions, so that I can still
   discover them in one call.
7. As an agent, I want `ergon edit <key>` with no field flag to fail naming the
   flags it accepts instead of opening `$EDITOR`, so that a set `$EDITOR` in my
   environment cannot trap the run.
8. As an agent, I want `ergon comment <key>` with no `--body` to fail naming
   `--body` instead of opening `$EDITOR`, for the same reason — both when adding
   a Comment and when editing one with `--id`.
9. As an agent, I want the `edit` and `comment` refusals to happen before any
   Jira call, so that no issue or Comment is fetched for a write that cannot
   happen.
10. As an agent, I want `ergon menu` to refuse to start without a terminal, with
    a message saying it needs one, so that it cannot sit on an invisible prompt.
11. As a person at a terminal, I want `ergon new`, `move`, `edit`, `comment` and
    `menu` to prompt and open my editor exactly as they do today, so that
    nothing about my own use changes.
12. As a person at a terminal, I want Remembered state to keep pre-selecting my
    prompts, so that the last Client SOW and epic I chose are still offered.
13. As a person at a terminal, I want to keep `--non-interactive` on
    `ergon new`, so that a shell loop creating issues gets deterministic
    resolution and never stops at a prompt.
14. As a person capturing output — `KEY=$(ergon new …)` — I want the run to be
    Non-interactive, so that a prompt is never drawn into output I cannot see.
15. As a person piping a Description — `ergon new --description - < spec.md` — I
    want the run to be Non-interactive automatically, so that I no longer need
    `--non-interactive` alongside it.
16. As a script author, I want a run that ergon detected as Non-interactive to
    resolve fields exactly as `--non-interactive` does — flags, then the Parent
    or epic, then config — so that the same command produces the same issue
    whoever runs it.
17. As a script author, I want a detected Non-interactive run never to write
    Remembered state, so that a scripted value is never offered back to a person
    as their last choice.
18. As a script author, I want detection to be silent — no notice on stderr — so
    that successful runs produce only their usual output.
19. As a script author, I want each failure to stop at the first value that is
    missing, with a non-zero exit code and the message alone on stderr, so that
    failures look like every other ergon usage error.
20. As a person who types a Description into a terminal on a run that will still
    prompt, I want the existing stdin-Source refusal to keep protecting me, so
    that the prompt after it does not hang on a closed stdin.
21. As a maintainer of the `jira` skill, I want ergon to be the only place that
    knows which commands would wait on a person, so that the skill's warning can
    be removed rather than kept true by hand.
22. As a maintainer of ergon, I want the Interactive decision made in one place,
    so that every command reads it the same way and a future prompt inherits it.

## Implementation Decisions

- **One decision, one place.** A small module answers "is this run Interactive?"
  from `Deno.stdin.isTerminal()`, `Deno.stdout.isTerminal()` and, for
  `ergon new`, the `--non-interactive` flag. Commands read that answer; none
  inspects the terminal itself. Both streams are checked because prompts read
  stdin but draw on stdout.
- **One Non-interactive mode.** `ergon new` passes the detected answer wherever
  it passes `interactive` today — `planSource`, `resolveFields`, the
  Remembered-state reads and writes, the sprint-by-name refusal — so a detected
  run and a flagged run take the same path. No third mode.
- **`--non-interactive` stays, on `ergon new` only.** Elsewhere, the flag that
  answers the question (`--to`, `--body`, the `edit` field flags) already avoids
  the prompt. Its help text should say that runs without a terminal are
  Non-interactive anyway.
- **No way to force Interactive.** Without a terminal there is nothing to answer
  a prompt.
- **Failures name the flag and stop at the first gap.**
  - `new`: "Project key is required." and "Summary is required." gain the flag
    (`--project`, `--summary`). These are the only values a Non-interactive
    `new` cannot do without; Parent, epic, labels, Client SOW and sprint keep
    their current Non-interactive resolution, including resolving to nothing. In
    particular a Task without `--parent` is still created without one, as
    Non-interactive runs do today — the Parent prompt is Interactive-only and
    its absence is not an error.
  - `move`: without `--to`, fails naming `--to`, before `getTransitions`. It
    does not list transitions; an unknown `--to` already does.
  - `edit`: when the plan would open the editor (no field flag given), fails
    naming the flags it accepts, before fetching the issue.
  - `comment`: with no `--body`, fails naming `--body`, before fetching or
    writing anything, for both the add and the `--id` edit path.
  - `menu`: refuses to start, saying it needs a terminal.
- **Detection is silent.** Nothing is printed when a run is detected as
  Non-interactive.
- **Unchanged.** Non-interactive label and Client SOW resolution (ADR 0001);
  `planSource`'s refusal of a stdin Source on an Interactive run, now reachable
  only when the Source is typed at the terminal itself.
- **Docs.** `CHANGELOG.md` (Changed: runs without a terminal are
  Non-interactive; `move`, `edit`, `comment`, `menu` fail instead of waiting),
  `README.md` where it describes `--non-interactive`, and `NOTES.md` — the
  follow-up recorded under the 2026-10-02 measurement is now done. Glossary and
  ADRs 0012/0014 are already written.
- **Skills.** The `jira` skill's warning and its `--non-interactive` usage
  become redundant. Updating the skill is the user's own work; the change
  summary should say so and nothing more.

## Testing Decisions

- **One seam: ergon as a subprocess.** `runErgon` in `tests/main_test.ts`
  already runs ergon with output captured and no terminal, so every run there is
  Non-interactive with no setup. Tests assert exit code and stderr only —
  external behaviour, not which function refused. A test completing at all is
  the proof that the run no longer hangs.
- Because each failure happens before the first Jira call, these tests need no
  Jira stub and no network. A test config (via the environment override
  `runErgonWith` supports) supplies a declared project without a default where a
  test needs one.
- **Cases:**
  - `new` with no resolvable project → names `--project`.
  - `new` with a project but no summary → names `--summary`.
  - `move X-1` without `--to` → names `--to`.
  - `edit X-1` with no field flag, `$EDITOR` set to something that would succeed
    → fails naming the field flags; the editor is not run.
  - `comment X-1` with no `--body`, `$EDITOR` set → names `--body`; likewise
    with `--id`.
  - `menu` → fails saying it needs a terminal.
- **Prior art:** "a usage error prints its message alone on stderr" in
  `tests/main_test.ts` is the shape to copy; `tests/text_source_test.ts` covers
  `planSource`'s refusal, which stays as it is.
- **Not automated:** the Interactive side. Proving a run at a terminal still
  prompts would need a pty. It is a manual check: run `ergon new`, `move`,
  `edit` and `comment` in a terminal and confirm each still prompts or opens the
  editor, and that `ergon new --non-interactive` there does not.
- Existing tests that construct `new`'s inputs with `interactive: true` (e.g.
  `resolveFields`) are unaffected: they test resolution, not detection.

## Out of Scope

- Errors as JSON. `--json` contracts describe results, not failures.
- Reporting every missing value in one error.
- Making labels or Client SOW required for a Non-interactive `new`.
- Adding `--non-interactive` to commands other than `new`.
- Removing `planSource`'s stdin refusal.
- Editing the `jira` or `worktime` skills.

## Further Notes

- `ergon move` and `ergon menu` prompting contradicted ADR 0012's claim that
  `new` is the only prompting command; a dated note on ADR 0012 records the
  correction.
- `Deno.stdin.isTerminal()` was confirmed on Deno 2.6.4 to report `false` for a
  pipe; `Deno.stdout.isTerminal()` is the same API on another stream.
- Rebuild `~/.local/bin/ergon` after implementing, per `AGENTS.md`.
