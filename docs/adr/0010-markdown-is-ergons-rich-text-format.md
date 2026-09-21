# Markdown is ergon's rich-text format

Supersedes [ADR 0003](./0003-descriptions-are-plain-text.md) and
[ADR 0004](./0004-descriptions-read-richer-than-they-write.md).

Every field Jira stores as Atlassian Document Format — a Description, a Comment
body, a worklog comment — is markdown as far as ergon is concerned, in both
directions. Markdown read out of Jira can be written back and mean the same
thing; markdown written into Jira reads back as the same markdown.

The two directions are defined against one set of constructs, the
**Expressible** set, rather than two. A construct is Expressible exactly when
reading emits it without reporting it Degraded, so "what ergon can show you" and
"what ergon can write" are the same sentence. Widening one direction widens the
other or it is not a widening at all.

## Why 0003 no longer holds

ADR 0003 declined a markdown converter because "ADF is a deep format and a
half-implemented converter is worse than none — it silently drops the constructs
it does not know". That objection was to silence, not to conversion.

ADR 0004 then built the read direction under a rule that answers the objection:
it never drops content silently. A construct whose shape markdown cannot carry
still has its text emitted and its type named alongside it. The rule transfers
to writing with its sense intact — markdown ergon cannot express becomes a named
refusal rather than a quiet omission — and once it does, 0003's argument no
longer reaches. What 0003 refused is a converter that fails silently. This is
not one.

The asymmetry ADR 0004 left behind was never desirable, only safe. It meant text
read out of `ergon get --json` and handed back to `ergon edit --description` was
written as flat paragraphs, so a real list became text shaped like one. An agent
reading a ticket and editing it is the ordinary case, not an edge, and that case
was lossy by construction.

Parsing is bought and mapping is built. Inline emphasis nesting, lazy list
continuation and CommonMark's whitespace rules are where a hand-rolled parser
goes quietly wrong, and getting them wrong corrupts a Description on write. The
mapping between the parsed tree and ADF stays ergon's own, next to its inverse,
where a reader can check the two against each other and a property test can hold
them honest. Handing the whole job to a converter library was rejected: every
available one handles a construct it cannot express by dropping it, and none
reports what it reduced, which would reintroduce exactly the failure 0003 was
written to prevent.

## Two refusals, and why only one has an override

Writing can fail in two ways, and they take different terms.

**Markdown ergon cannot express** — an image, raw HTML, a footnote, or a legal
construct in a placement ADF's schema forbids, such as a table inside a list
item — is refused outright, with no override flag, and none is added. The
content being refused is the caller's own draft. It is still in hand and
trivially rewritten without the image or the nesting. There is nothing to force
past, only text to fix. Because there is no choice to weigh, the refusal is
raised by the conversion itself rather than by a policy layer above it.

**A Replacement ergon cannot reproduce** — overwriting a Description or a
Comment holding a panel, a mention, or a table with merged cells — is refused
with `--force`, which keeps its single existing meaning and its editor
carve-out. Here the content belongs to someone else and Jira keeps no
field-level undo, so the original is gone the moment the PUT succeeds. The
override exists because the loss is worth choosing deliberately; 0003's
reasoning for that is unchanged.

Keeping `--force` scoped to the second is what stops a caller who reaches for it
for the first reason from silently accepting the second.

The Replacement guard is the round trip itself: a document may be replaced when
rendering it to markdown and parsing it back yields the same document. A
type-level check is no longer safe, because a table with merged cells holds only
node types that are now Expressible and would be waved through while `colspan`
vanished. There is no list to maintain and it cannot drift as ADF grows.

## Consequences

The guarantee is semantic, not byte-wise. Markdown has synonyms — `_x_` and
`*x*`, `+ item` and `- item`, setext and ATX headings — so an agent that writes
one spelling reads back the canonical one. The meaning survives; the spelling
canonicalises. Promising byte-identity would be a documented lie the first time
an agent wrote `_x_`.

There is no way to write literal, unformatted text, and no flag is added for
one. `ergon edit --description - < deploy.log` now turns a line beginning `#`
into a heading and a diff hunk beginning `-` into a list. This is a real
regression, documented rather than mitigated: the escape hatch is markdown's
own, which is to fence it. A `--literal` flag would buy a forgetful caller
nothing three backticks do not, while adding a second format mode to a tool that
now has one.

Reading changes shape. Blocks separate with a blank line rather than the single
newline ADR 0004 chose to mirror the old line-per-paragraph model, because under
CommonMark two paragraphs separated by one newline are one paragraph. A table
gains a delimiter row and leaves the Degraded set. This breaks the text
`ergon get --json`, `ergon comments --json` and `ergon worklogs` emit, and is
accepted rather than versioned — ergon is a personal CLI whose output is re-read
each time, and carrying two renderers to avoid one breaking change is the worse
trade.

Three things are normalised rather than compared, and each is a rule rather than
a taste. A run of text Jira split as the cursor moved through it is coalesced.
Mark arrays compare without regard to order. And a paragraph with nothing in it
is dropped on both sides: markdown has no way to spell an empty paragraph, since
blank lines are separators, and the Jira editor produces them constantly —
refusing would put most hand-written Descriptions out of reach. Nothing is lost
by it, because there is nothing in it to lose.

The write side mints a `localId` for a task list and its items, which is the one
place ergon writes an identifier Jira would otherwise mint. Jira's validator
wants one present; the guard strips them by provenance either way, so no
comparison depends on them.

Markdown cannot spell every arrangement of Expressible constructs, and those
arrangements are refused like any other. Two emphasised runs written side by
side share a delimiter run and read back as something else; an emphasised run
whose first or last character is punctuation, sitting against a letter, has
delimiters that do not flank. Both read out whole and neither can be written
back, so the guard refuses the rewrite.

The Expressible set stops short of panels, media, expands, mentions, emoji,
inline cards, dates and status lozenges. Each needs either a Jira-side
identifier ergon does not hold or a markdown extension ergon would have to
invent, and inventing syntax to carry them is the half-implemented converter
0003 declined. They stay readable-and-Degraded and stay unwritable.

The guarantee is about fidelity, not intent. An agent that turns a log line into
a heading by mistake reads that heading back faithfully, and nothing here can
tell the two apart.
