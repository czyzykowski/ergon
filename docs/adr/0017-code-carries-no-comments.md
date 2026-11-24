# Code carries no comments

ergon's TypeScript (`src`, `tests`, `scripts`, `lint`) has no comments: no `//`,
no `/* */`, no JSDoc. The only exception is a directive a tool acts on, written
bare: `deno-lint-ignore <rules>`, `deno-lint-ignore-file <rules>`,
`deno-fmt-ignore`, `deno-coverage-ignore…`, `@ts-expect-error`, `@ts-ignore`,
`@ts-nocheck`, `oxlint-disable…`/`oxlint-enable…`, `@deno-types="…"` and a
triple-slash `<reference … />`. A reason written after one is a comment like any
other.

Every comment in the code turned out to be one of four things, and each has a
better home:

- **It restates the code.** Delete it; if the code did not say it clearly
  enough, rename or extract until it does.
- **It explains code that is hard to follow.** Restructure the code. A comment
  lets the next reader keep paying for the difficulty.
- **It excuses something the code should not do.** Fix the code.
- **It records a decision or a fact about the world**, such as how Jira answers
  a create, or why there is no `vi` fallback. A decision goes in an ADR.
  Expected behaviour, Jira's included, goes in a test whose name states it,
  where it is checked rather than merely asserted. Anything left over goes in
  `NOTES.md`; a term goes in `GLOSSARY.md`.

ergon generates no documentation from JSDoc, so a doc comment has nothing to do
that a name and a type do not.

Nix, YAML and shell are executable configuration, not code that can be
restructured to explain itself, and keep their comments.

## Enforcement

`ergon/no-comments` (`lint/no-comments.ts`) is a `deno lint` plugin rule, and
`scripts/check-comments.ts` (`deno task check:comments`) runs it on changed
lines only: the staged diff in the pre-commit hook, and the pushed commits or
the PR in CI. A comment is reported when any of its lines is added or changed,
so editing an old comment removes it. Renames are not detected, so moved code
counts as added and loses its comments. Existing comments stay until their lines
are touched; there is no sweep.

The rule is deliberately not in `deno.json`, or plain `deno lint` would fail on
the comments that predate it.

The ban cannot be switched off from the code. A `deno-lint-ignore` that names
`ergon/no-comments`, or that names no rules and so would silence every one, is
itself reported. A file-level ignore would make `deno lint` skip the whole file,
so the check lints a copy in which `deno-lint-ignore-file` cannot take effect.
The only way past is `git commit --no-verify`, and CI does not have that.

## Consequences

The one directive with a reason, the editor's scratch file under
`ergon/atomic-write`, went away: that rule now accepts a write to a path the
same function got from `Deno.makeTempFile`, which is the code saying "scratch".

A refactor that moves commented code makes it lose the comments, and anything
worth keeping in them has to go to one of the homes above in the same change.
