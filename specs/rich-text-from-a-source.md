# Rich Text from a Source

## Problem Statement

[ADR 0010](../docs/adr/0010-markdown-is-ergons-rich-text-format.md) made
markdown the format ergon speaks for every rich-text field, and
[rich-text-as-markdown.md](./rich-text-as-markdown.md) built the converter. A
Description can now carry headings, checklists, fenced code and tables, and
ergon carries them in both directions without Degrading.

What it cannot do is get that markdown into `ergon new`. The only Source is the
argv string: `--description "…"`. A Description worth writing in markdown is a
Description too long to quote into a shell, so the richer the body, the less
usable the only way of supplying it. The `jira` skill already carries the
workaround as documented advice:

> `--description -` reads the body from stdin, which is how to write multi-line
> markdown without fighting shell quoting. `ergon new` has no stdin form, so a
> long body there means creating the ticket and then editing it.

Create-then-edit is two Jira round-trips for one ticket, and it leaves a window
in which the issue exists with no Description — long enough for the board to
show it, and for `ergon ls` to report it. It is also the one path `ergon edit`
guards: a Replacement is refused when the held content cannot be round-tripped,
so a create-then-edit of a Description ergon itself just wrote is a Replacement
being guarded against ergon's own output.

`ergon log --description` has the same hole for the same reason, and a worklog
comment is markdown on the same terms.

Neither command can read a file at all, and nor can any other. `ergon edit` and
`ergon comment` reach one only through a shell redirect.

## Solution

A rich-text flag stops being the text and starts being able to name where the
text is.

```
ergon new --project PCK --description-file spec.md --non-interactive …
ergon new --description-file - --non-interactive … <<'EOF'
## Acceptance criteria

- [ ] The importer refuses a CSV with no header row
EOF
ergon log PCK-12 2h --description - < note.md
```

One rule covers it: **`-` means stdin on every rich-text flag, and a
`--<field>-file` sibling exists only where stdin is contended.** Stdin is
contended on exactly one command — `ergon new` is the only one that prompts — so
`--description-file` is added there and nowhere else. On a command that never
prompts, `--description -` with a shell redirect already reads a file, and a
second flag for it would be surface that does nothing.

| command         | inline | stdin `-` | `--<field>-file` |
| --------------- | ------ | --------- | ---------------- |
| `ergon new`     | yes    | **new**   | **new**          |
| `ergon log`     | yes    | **new**   | no               |
| `ergon edit`    | yes    | yes       | no               |
| `ergon comment` | yes    | yes       | no               |

**Source** enters ergon's language for the distinction this opens up: where a
rich-text value is read from, as distinct from the value itself. The asymmetry
in the table is the decision recorded in
[ADR 0012](../docs/adr/0012-a-file-flag-only-where-stdin-is-contended.md).

## User Stories

1. As an agent, I want to create an issue whose Description is a markdown file I
   just wrote, so that a checklist of acceptance criteria arrives as a checklist
   in one call.
2. As an agent, I want to pipe a Description into `ergon new` from a heredoc, so
   that composing one does not mean quoting it into argv.
3. As an operator, I want `ergon new --description-file spec.md` to still prompt
   me for the epic, labels and Client SOW, so that reading a file does not cost
   me the interactive path.
4. As an operator, I want a mistyped path to fail before I answer any prompts,
   so that a typo does not cost me six answers and two round-trips.
5. As an operator, I want a Description that ergon cannot express to be refused
   before the prompts too, and the refusal to name the file to fix, so that I
   know which draft to open.
6. As an operator, I want `ergon new --description -` to read stdin rather than
   create a ticket whose Description is the single character `-`, so that the
   habit `ergon edit` taught me does not silently produce a one-character
   ticket.
7. As an operator, I want to be told to pass `--non-interactive` when I pipe a
   Description into `ergon new`, so that the run fails with a message instead of
   hanging at a prompt it has no stdin left to answer.
8. As an operator, I want an empty file or an empty pipe refused, so that a
   generator that produced nothing does not create a ticket I have to clean up.
9. As an operator, I want `--description` and `--description-file` together
   refused, so that I never have to remember which one wins.
10. As an operator, I want to log time with a worklog description from a pipe,
    so that `ergon log` is not the one rich-text flag left behind.

## Implementation Decisions

### Domain

**Source** is added to `CONTEXT.md`. The `-` convention has been live on
`ergon edit` and `ergon comment` since they shipped without ever being written
down, which is plausibly how it came to be applied inconsistently in the first
place; naming it is what makes the asymmetry in the table above statable rather
than apparently accidental.

The **None** entry is deliberately left alone. `none` is not a path sentinel —
`--description-file none` reads a file called `none` — and the entry already
decides this, because it scopes the convention to "wherever `none` cannot
collide with a real value of the field". A path is one of those places. The
glossary was written well enough to cover a case it had not met.

### Command surface

`--description-file <path>` on `ergon new`, with `-` as the path meaning stdin.
A path-valued flag rather than more sentinels on `--description`: ergon's own
**None** entry states that a sentinel convention stops where it can collide with
a real value, and a Description is the free-text field where any sentinel can.
`-` as a _path_ carries no such risk, being both unambiguous and the universal
Unix spelling.

`--description -` is also added to `ergon new`, where it currently creates an
issue whose Description is the literal text `-`. That is the worst failure mode
available — a silent wrong result, from a form that works on `ergon edit` and
`ergon comment` — and closing it is most of why story 6 exists.

`ergon edit` and `ergon comment` gain nothing. Neither prompts, so
`--description - < spec.md` already reaches a file on both.

### Stdin against prompting

A stdin Source on a run that may prompt is **refused**, with a message pointing
at the flag that survives prompting:

```
Reading the Description from stdin needs --non-interactive; pass
--description-file <path> to read a file and still prompt.
```

`ergon new` consumes stdin for the Description and then has nothing left to
answer the epic prompt with, so it **hangs** — no error, no timeout. The refusal
is what stops a flag whose most natural invocation produces no output at all.

The rule is written against the Source rather than against the flag, so
`--description-file -` is refused on a prompting run too. The hazard is reading
stdin, not which flag spelled it; the message's advice — pass a path — is the
only form that actually works.

This hang is older than this feature. Any `ergon new` that needs a prompt in a
non-tty context hangs today, which the `jira` skill warns about in its own
words. Guarding every prompt site with `Deno.stdin.isTerminal()` would fix the
class, and is deliberately **not** done here: it rewrites prompting for runs
that have nothing to do with sourcing a Description. It is named in `NOTES.md`
as its own change.

### Reading a Source

The Source is read **eagerly**, before any Jira call, and the markdown is
checked for Expressibility at the same moment. Both failures therefore land
before the first prompt rather than after six answers and two round-trips — the
whole of stories 4 and 5.

Checking Expressibility early means parsing the markdown twice, once to check
and once inside `createIssue`. That is a pure in-memory parse of a document
small enough to be a ticket body, and it buys moving every refusal to before the
side effects. The alternative — converting in the command and handing ADF to
`createIssue` — changes a public signature used by every create path to buy the
same thing.

A refusal from a file Source renames its remedy to name the file:
`Rewrite spec.md without it.` `UnexpressibleError` already takes a `remedy`
parameter for exactly this, and gains a `reason` field so one can be rebuilt
with a different remedy. A stdin Source keeps the generic remedy, there being no
file to name.

### An empty Source

An empty or whitespace-only file, and an empty pipe, are **refused**:

```
spec.md is empty; a Description needs text.
Nothing arrived on stdin; a Description needs text.
```

Naming a Source asserts that there is text. An empty one is almost always an
upstream failure — a wrong path, a generator that produced nothing, an empty
heredoc, a `$(…)` that failed — and the costs are not close: refusing costs one
retry, while proceeding creates a real issue with a key, a board position and a
blank Description that a human has to find and clean up. This is
`ergon
comment`'s existing stance, and the "changed my mind" case that
complicates it there does not exist here, because `ergon new` has no editor
buffer.

Inline text is **not** refused when blank, because the caller supplied it rather
than naming a place to find it, and `--description ""` has always been accepted.
It is normalised to no Description at all by `omitIfBlank`, which closes a
latent oddity: `createIssue` guards with `if (input.description)`, so
`--description ""` was skipped while `--description "  "` sent an empty ADF
document to Jira. `ergon
log` carried the same oddity through `worklogBody` and
is normalised with it.

### Conflicting flags

`--description` and `--description-file` in one invocation are refused rather
than resolved by precedence. Nothing in the invocation says which the caller
meant, and a precedence rule is a coin flip they would have to remember.

### Modules

`src/text_source.ts` holds the feature, in the shape `src/rewrite.ts` and
`src/worklogs.ts` set: pure decisions that throw, and one orchestrator over a
narrow interface.

- `Source` is `{kind: "inline"; text} | {kind: "stdin"} | {kind: "file"; path}`.
- `planSource` is pure: it settles which Source an invocation names, refuses the
  flag conflict and refuses stdin on a prompting run.
- `readSource` reads one, over a `StdinReader` the tests fake, and refuses a
  blank result naming the Source it came from.
- `assertExpressible` applies ADR 0010's refusal early, renaming the remedy for
  a file.
- `refuseBlank` moves here from `src/commands/comment.ts`, which keeps its own
  message — now a named constant — and imports the test for "nothing". This is
  reuse rather than refactoring taste: a second copy of
  `text.trim().length === 0` is how two paths come to disagree about what
  "empty" means. It is also the only change to a file this feature otherwise has
  no business in, so it is kept to the import, the constant and the two call
  sites that already went through the old local helper.
- `omitIfBlank` answers the same question on the way out: the text, or undefined
  when there is effectively none. Both `ergon new` and `ergon log` need it and
  neither should own it, for the reason directly above — the first draft of this
  feature left a copy of the test inline in each command, which is exactly what
  moving `refuseBlank` was meant to stop.

`UnexpressibleError` gains `readonly reason`, so a refusal can be rebuilt with a
remedy that names the file.

## Testing Decisions

The pure parts carry the weight, as they do for `planEdit` and
`assertRewritable`.

- `planSource` settles each Source: inline, `-` as inline, a path, `-` as a
  path, and nothing at all.
- `planSource` refuses both flags together, and names both.
- `planSource` refuses a stdin Source on a prompting run, from either flag, and
  permits it when not prompting.
- `readSource` reads a file, and reads stdin through a faked reader.
- `readSource` refuses an empty file, a whitespace-only file and an empty pipe,
  and the message names the file or stdin.
- `readSource` reports a missing path as a missing path.
- `assertExpressible` passes expressible markdown and refuses an image, naming
  the file in the remedy and leaving a stdin Source with the generic one.
- `refuseBlank` throws the complaint it is handed and returns the text it is
  not, which is as much as a test outside `ergon comment` can pin: the message
  is `comment.ts`'s own constant, and asserting it from here would only re-read
  a literal this test passed in.
- `omitIfBlank` treats undefined, `""` and whitespace-only alike as no value,
  and leaves surrounding whitespace on real text alone. It is the one guard on
  the `--description "  "` fix, which no command-level test can reach.

## Out of Scope

- **An `$EDITOR` path on `ergon new`.** `edit` and `comment` open a buffer when
  their text flag is absent; `new` still does not, and this leaves a real gap:
  an interactive human with a long Description writes a file first, or creates
  then edits. Folding it in would mean deciding what an untouched buffer means
  on a command with nothing to leave alone, where it would collide with the
  refuse-blank rule above. `comment` needed a comment block to explain why its
  untouched buffer is not a blank body; that knot is not worth tying for a
  source nobody asked for.
- **Guarding `ergon new`'s prompts against a non-tty stdin.** Named above, its
  own change.
- **`--description-file` on `edit`, `comment` or `log`.** ADR 0012.
- **A file Source for `--summary`.** A summary is one line; the problem this
  spec solves does not exist there.
- **Migrating `edit` and `comment` onto `readSource`.** Both duplicate the stdin
  read that `readSource` now subsumes. Neither is broken, and refactoring files
  this feature does not otherwise touch is how a small change becomes a large
  diff.
