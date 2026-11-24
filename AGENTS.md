# Agent Instructions (ergon)

This file guides agentic coding assistants working in this repo. Follow these
rules for every change you make.

## Global Expectations

- Keep `CHANGELOG.md` up to date using Keep a Changelog.
- Maintain root `NOTES.md` with discoveries and decisions.
- Keep `README.md` current with setup/usage.
- Update the progress tracker in `NOTES.md` when milestones change.
- Prefer small, focused changes; avoid unrelated cleanup.
- Rebuild the installed binary after any substantial change (see Build).
- When a command, flag or `--json` field is added, changed or removed, say so in
  your summary and suggest updating the Claude skills that drive ergon: `jira`
  for ticket work and `worktime` for time. Those skills carry their own ergon
  command references and procedures, and they go stale silently — an agent
  follows a skill's instruction without checking it against the CLI, so a
  command the skill does not know about is a command that never gets used, and
  an instruction the CLI has outgrown becomes a confident wrong answer. ergon
  has no way to notice this itself; the change that creates the drift is the
  only moment anyone is looking.

## Repo Overview

- CLI name: `ergon`.
- Language/runtime: Deno (TypeScript).
- CLI entrypoint: `src/main.ts`.
- Core workflow: Jira + Clockwork integration with local state.

## Build / Test / Lint Commands

### Build

- Run directly:
  `deno run --allow-net --allow-read --allow-env --allow-write src/main.ts`.
- Install:
  `deno install --allow-net --allow-read --allow-env --allow-write --name ergon src/main.ts`.
- Rebuild after any substantial change, so the working copy is what the `ergon`
  on `PATH` actually runs:
  `deno compile --allow-net --allow-read --allow-env --allow-write --allow-run -o ~/.local/bin/ergon src/main.ts`.

### Check

- `deno task check` runs format check, lint, type check, oxlint and tests, as CI
  does. The pre-commit hook in `.githooks/` runs only `deno task check:static`
  and `deno task check:comments` (no tests, a few seconds), once a clone has run
  `git config core.hooksPath .githooks`, so run `deno task test` yourself before
  committing a behaviour change. Fix formatting with `deno fmt`.
- Run tests through `deno task test`: plain `deno test` lacks the permissions
  the config tests need.

### Mutation testing

The pre-push hook mutates the lines your branch changed and blocks the push on
each _survivor_, printed as `file:line:col Status Mutator: original → mutant`. A
survivor is a change to your code that no test notices. For each one:

1. Write or tighten a test that passes on the original and fails on the mutant,
   then rerun `deno task mutate:diff` until it reports no survivors.
2. When no test can tell the two apart, the mutated code is redundant: a
   shortcut the general path covers, or a check that cannot fail. Simplify it
   away so the mutant has nothing to change. If no simpler shape exists, stop
   and show the user the survivor.

A `Timeout` usually means a busy machine: rerun before treating it as a
survivor. When the hook stops at its three-minute limit, the branch is too big;
tell the user. Skipping the hook with `--no-verify` is the user's decision, so
ask them.

## Code Style Guidelines

### TypeScript Conventions

- Use 2-space indentation; no tabs.
- Prefer `const` over `let` when possible.
- Keep modules small; extract helpers for clarity.
- Use `async/await` for IO and API calls.
- Avoid `any` unless interfacing with external APIs.

### Code Without Comments

- TypeScript says everything in code: names, extracted functions and test names
  carry what a comment would. A decision goes in an ADR, any other fact in
  `NOTES.md`; [ADR 0017](docs/adr/0017-code-carries-no-comments.md) maps each
  kind of comment to its home.
- The only comments are bare tool directives, such as
  `// deno-lint-ignore <rule>` or `// @ts-expect-error`, with no reason after
  them.
- `deno task check:comments` enforces this on added and changed lines, in the
  hook and in CI. A comment on a line you change goes; comments on lines you
  leave alone stay. Nix, YAML and shell keep their comments.

### Imports

- Group standard modules, then third-party, then local.
- Keep imports sorted within each group.

### Naming

- Types: `UpperCamelCase`.
- Functions/vars: `lowerCamelCase`.
- Avoid one-letter names except simple closures.

### Error Handling

- Prefer `throws` and propagate errors upward.
- Use clear error messages for CLI failures.
- Avoid silent failures unless explicitly required.

### File IO

- Keep filesystem paths built with `URL` or `path` helpers.

## Testing Guidelines

- Prefer deterministic dates and fixed timestamps.
- Use temp directories for filesystem tests.
- Cover config parsing and API error handling first.
- Use mocking where appropriate.

## Documentation / Progress Updates

- Update `CHANGELOG.md` for user-visible changes.
- Update `NOTES.md` with facts/decisions and next steps.

## Code Quality Pass

- After implementing a new feature, re-read the related code and apply
  improvements that make it easier to understand and maintain.
- Prefer changes that also improve testability when possible.
- Keep improvements scoped to the feature; avoid unrelated refactors.

## Agent-Specific Notes

- Avoid introducing external binaries beyond Deno unless requested.
- Keep CLI behavior aligned with the implementation plan.

## Git Workflow

- Create a git commit after each meaningful, atomic change.
