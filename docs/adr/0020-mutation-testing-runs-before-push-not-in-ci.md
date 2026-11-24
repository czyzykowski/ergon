# Mutation testing runs before push, not in CI

Mutation testing checks that the tests notice when the code changes, which
coverage cannot: a line can run under a test that asserts nothing about it. It
runs in the pre-push hook, over the lines a branch changed since it left
`origin/develop`, and a surviving mutant blocks the push. It stays out of CI,
where the coverage floor remains the gate.

The hook is where the fix happens. An agent pushing a branch gets the survivors
back as `file:line:col` lines while the change is still its own, and it can add
the missing assertion before anyone reviews the branch. A CI failure arrives
after the push, to whoever reads it, and a score over the whole codebase blames
every branch for the 339 survivors that were already there when this started.

Only a branch's own lines are mutated, and only in the domain modules: the pure
`src/*.ts` files, without `main.ts`, `editor.ts` and `interactive.ts`, and
without `src/commands/` and `src/api/`. Mutants there are mostly output
formatting and wiring, where a survivor is noise rather than a missing
assertion.

A survivor has no escape hatch: there are no `// Stryker disable` comments. A
mutant no test can kill changes nothing observable, so the code it mutates is
redundant (a shortcut the general path covers, a check that cannot fail), and
the fix is to simplify that code away. That makes mutation testing a check on
the code as much as on the tests. It also keeps faith with
[ADR 0017](./0017-code-carries-no-comments.md), which would otherwise need an
exception for a directive that must say why.

## Considered options

- **A score floor in CI**, like coverage. Rejected for now: a full run takes
  about twelve minutes, and the hook already holds each branch to zero survivors
  in its own lines, which a floor could only loosen.
- **A Deno-native tool.** The only one, Mutasaurus, is an early academic project
  without test selection or incremental runs. StrykerJS has no Deno support
  either, but its command runner runs `deno test` per mutant, and Stryker itself
  runs under Deno with `nodeModulesDir: "auto"`, so ergon still needs nothing
  but Deno.

## Consequences

- Every mutant runs the whole suite, since the command runner cannot pick the
  tests that cover it. The hook stops after three minutes, enough for about 250
  changed lines in scope; a larger branch should be split, or its files mutated
  with `deno task mutate`.
- A timeout fails the push, although Stryker counts it as a kill: on a saturated
  machine a timeout is starved CPU, not a mutant caught looping. Stryker runs on
  half the cores for the same reason.
- Incremental mode stays off. With the command runner it notices only changes to
  the code, so a test added to kill a survivor would not make it run again.
- `--no-verify` skips the hook. That stays the person's call, not the agent's.
