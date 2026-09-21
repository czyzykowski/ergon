# Rich Text as Markdown

## Problem Statement

An agent writing to Jira through ergon writes markdown, because markdown is what
an agent writes. ergon flattens it. `toAdf` splits the text on newlines and
emits one paragraph per line, so a checklist of acceptance criteria arrives in
Jira as a column of literal `-` lines, a code fence arrives as three paragraphs,
and a table arrives as pipes. Nothing errors. Nothing is reported. The agent has
no way to know, because the failure is invisible from where it stands.

The same gap runs the other way in a subtler form. `renderAdf` reads any
Description out as markdown-flavoured text, so an agent handed a Description
sees a bullet list. It then edits that text and writes it back, and the list it
read becomes text shaped like a list.
[ADR 0004](../docs/adr/0004-descriptions-read-richer-than-they-write.md) names
this and accepts it: _"Text read from `ergon get --json` and passed back to
`ergon edit --description` is written as flat paragraphs, so a real list becomes
text shaped like one."_ It was the right call when there was no converter. It is
now the main way ergon loses an agent's work.

[ADR 0003](../docs/adr/0003-descriptions-are-plain-text.md) declined a markdown
converter deliberately, and its reason was sound: _"ADF is a deep format and a
half-implemented converter is worse than none — it silently drops the constructs
it does not know."_ That reasoning was written when ergon had nothing in either
direction. It now has `renderAdf`, which enumerates the constructs and, more to
the point, established the discipline that answers the objection: never drop
content silently, name what was reduced.

The cost of leaving this alone is not cosmetic. A ticket is what an agent reads
to know what to do. A checklist rendered as prose is a checklist nobody can
tick, and a set of acceptance criteria that arrives as an undifferentiated wall
is one a reviewer cannot check off. The formatting is the meaning.

## Solution

Markdown becomes the format ergon speaks for every rich-text field. A
Description is markdown. A Comment body is markdown. A worklog comment is
markdown. ergon reads markdown out and writes markdown back, and the two
directions are defined as inverses of one another over a named set of
constructs.

Three things follow, and they are the whole feature.

**Reading emits canonical markdown.** `renderAdf` already emits
markdown-flavoured text; it starts emitting markdown a parser can read back —
blank lines between blocks, and real GFM tables with a delimiter row. What it
emits is now input, not decoration.

**Writing parses markdown.** `toAdf` stops splitting on newlines and starts
parsing. A heading becomes a heading, a fenced block becomes a code block with
its language, a checklist becomes a task list, a table becomes a table.

**The two are inverses by definition.** The set of constructs ergon writes is
_defined_ to be the set it reads without Degrading — one set, not two. That
definition is what makes the guarantee statable and the guard computable, and it
is what keeps this from becoming the half-implemented converter ADR 0003
declined.

Two refusals hold the edges. Markdown ergon cannot express is refused outright,
with no override, because the caller still holds the text and can fix it.
Replacing existing content ergon could not reproduce is refused with `--force`,
exactly as today, because that content belongs to someone else and Jira keeps no
field-level undo.

This supersedes ADR 0003 and ADR 0004 rather than amending them.

## User Stories

1. As an agent, I want a checklist I write in a Description to arrive in Jira as
   a real task list, so that a reviewer can tick items off in the web UI.
2. As an agent, I want a table I write in a Description to arrive as a real
   table, so that acceptance criteria stay readable as a grid.
3. As an agent, I want a fenced code block to arrive as a code block with its
   language, so that a snippet in a ticket is syntax-highlighted rather than
   mangled into paragraphs.
4. As an agent, I want headings in a Description to arrive as headings, so that
   a long ticket has navigable structure.
5. As an agent, I want nested bullet lists to survive with their nesting, so
   that a decomposed task keeps its shape.
6. As an agent, I want bold, italic, strikethrough and inline code to survive,
   so that emphasis I intended is emphasis a reader sees.
7. As an agent, I want a markdown link to arrive as a real link, so that a
   reference in a ticket is clickable.
8. As an agent, I want a numbered list starting at a number other than one to
   keep its starting number, so that a continued list reads correctly.
9. As an agent, I want a blockquote to arrive as a blockquote, so that quoted
   context is visually distinct from my own words.
10. As an agent, I want a horizontal rule to survive, so that sections I
    separated stay separated.
11. As an agent, I want everything above to hold for a Comment body as much as
    for a Description, so that I do not have to remember which field formats and
    which does not.
12. As an agent, I want everything above to hold whether I am creating an issue
    or editing one, so that the format does not depend on the command.
13. As an agent, I want a Description I wrote to read back as the same
    Description, so that I can verify what landed without opening a browser.
14. As an agent, I want that read-back guarantee stated in terms of meaning
    rather than bytes, so that I am not surprised when `_italic_` returns as
    `*italic*`.
15. As an agent, I want markdown ergon cannot express to be refused with an
    error, so that I find out at the point of writing rather than never.
16. As an agent, I want that refusal to name the construct, so that I know what
    to remove without guessing.
17. As an agent, I want a refusal when my markdown nests something ADF forbids —
    a table inside a list item — so that I get an actionable message instead of
    an opaque Jira 400.
18. As an agent, I want no flag that forces unexpressible markdown through, so
    that there is exactly one correct response to the refusal: fix the markdown.
19. As an agent, I want to read a Description authored in the Jira web UI as
    markdown, so that a ticket a human wrote is as legible to me as one I wrote.
20. As an agent, I want anything that lost its shape on the way out named
    alongside the text, so that I am never handed a body and left to assume it
    is whole.
21. As an operator, I want `ergon edit` with no flags to open my Description in
    `$EDITOR` as markdown, so that I can restructure a ticket in the editor I
    already use.
22. As an operator, I want that buffer to be a `.md` file, so that my editor
    highlights and folds it correctly.
23. As an operator, I want `ergon edit` to open for far more tickets than it
    does today, so that a ticket with a bullet list stops being off limits.
24. As an operator, I want ergon to still refuse to rewrite a Description
    holding something it cannot reproduce, so that I cannot destroy a
    colleague's panel or attachment by accident.
25. As an operator, I want that refusal to cover a table whose cells are merged,
    so that structure survives even where the node type is one ergon knows.
26. As an operator, I want `--force` to keep meaning exactly what it means
    today, so that a habit I already have does not quietly acquire a second
    meaning.
27. As an operator, I want to know that piping a log file into a Description
    will format it, so that I fence it rather than discovering the mangling in
    Jira.
28. As an operator, I want creating an issue to never refuse on the replacement
    guard, so that `ergon new` is not slowed by a check that protects nothing.
29. As a teammate reading Jira in the web UI, I want tickets an agent filed to
    look like tickets a person filed, so that I do not have to decode them.
30. As a maintainer, I want the set of constructs ergon writes to be defined
    rather than listed, so that the two directions cannot drift apart as ADF
    grows.
31. As a maintainer, I want the replacement guard computed from the round trip
    rather than from a maintained table, so that an attribute nobody thought to
    classify cannot silently destroy content.
32. As a maintainer, I want one property test that proves both the round-trip
    guarantee and that the guard does not fire on documents ergon can write, so
    that the two cannot disagree.
33. As a maintainer, I want the markdown parsing itself to come from a library,
    so that ergon does not own the parts of markdown that are hard and already
    solved.
34. As a maintainer, I want the mapping between markdown and ADF to stay ours,
    so that the decisions about what ergon supports are written down in ergon.

## Implementation Decisions

### Domain

Two terms enter the language, and two change.

- **Expressible** — of a construct ergon carries in both directions: markdown it
  can turn into ADF, and ADF it can turn back into that same markdown.
  Deliberately one set rather than two: what ergon writes and what it reads
  without Degrading are defined to be the same constructs.
- **Replacement** — a write that overwrites existing content, as opposed to one
  that creates it. Only a Replacement is guarded, because only a Replacement can
  destroy something Jira cannot restore.
- **Description** loses its "reads richer than it writes" clause. That asymmetry
  is what this spec removes.
- **Degraded** becomes strictly a read-side term. Write-side loss is now a
  refusal rather than a reduction, so there is nothing Degraded about a write. A
  table also leaves the Degraded set, because a table becomes Expressible.

**Comment** gains a sentence saying its body is markdown on the same terms as a
Description. No new term: `specs/comment-on-issue.md` was right that a Comment
is a second field under the same decisions, and that stays true — the decisions
underneath it are what changed.

### The Expressible set

The set is defined, not enumerated by taste: **a construct is Expressible if and
only if `renderAdf` emits it without reporting it Degraded.** Today that is
paragraph, heading, blockquote, rule, bullet list, ordered list, task list, list
item, code block with language, and the `strong` / `em` / `strike` / `code` /
`link` marks.

One construct is promoted into the set by this spec: **table**. It is currently
reported Degraded only because the renderer was lossy — it emits cell text
joined by pipes with no delimiter row, which is not a GFM table. GFM has tables
and ADF has tables; once `renderAdf` emits a delimiter row, the Degraded report
has nothing left to say about a plain table.

Everything else stays outside: panel, media, expand, nested expand, mention,
emoji, inline card, date, status. These remain readable-and-Degraded, and remain
unwritable. Widening the set to carry mentions or emoji is explicitly not done,
for ADR 0003's reason, unchanged.

### Reading emits canonical markdown

`renderAdf`'s contract is unchanged — text plus what was Degraded — but its
output becomes markdown a parser can read back:

- Blocks separate with a blank line rather than a single newline. ADR 0004 chose
  the single newline deliberately, to mirror `toAdf`'s line-per-paragraph model;
  that model is gone, and under CommonMark two paragraphs separated by one
  newline are one paragraph with a soft break. The old separator is lossy the
  moment anything parses the output.
- A table emits a header row and a delimiter row, and stops being Degraded.

This is a **breaking change to `ergon get --json`, `ergon comments --json` and
`ergon worklogs`**, whose description and body text change shape, and whose
`descriptionDegraded` / `bodyDegraded` stop reporting `table`. It is accepted
rather than versioned: ergon is a personal CLI, the output is consumed by agents
that re-read it each time, and carrying two renderers to avoid one breaking
change is the worse trade.

### Writing parses markdown

`toAdf` takes markdown and returns a document. Parsing comes from
`mdast-util-from-markdown` with `micromark` and `remark-gfm`; the mapping from
the parsed tree to ADF is ergon's own.

The division is deliberate. The dependency does the part that is hard and solved
— inline emphasis nesting, lazy list continuation, CommonMark's whitespace rules
— which is exactly where a hand-rolled parser goes quietly wrong, and getting it
wrong corrupts a Description on write. The mapping does the part that encodes
ergon's decisions, and that stays in ergon next to its inverse, where a reader
can check the two against each other and a property test can hold them honest.

A converter library is rejected for the whole job. Every available one —
`marklassian`, `markdown-to-adf`, `extended-markdown-adf-parser` — handles a
construct it cannot express by dropping it or by offering a raw-ADF escape
hatch, and none reports what it reduced. Handing the write path to a library
that fails silently would reverse ADR 0003 by reintroducing the exact failure it
was written to prevent. `remark-gfm` is chosen over a Markdown-to-HTML lexer
because it yields a typed tree with GFM tables, strikethrough and task lists —
the three constructs beyond CommonMark that `renderAdf` already emits.

This is ergon's first npm dependency; the existing imports are `deno.land/x` and
`deno.land/std` URLs. `deno compile` handles npm specifiers, so the installed
binary is unaffected.

### Refusing unexpressible markdown

`toAdf` reports what it could not express, and the caller refuses. Two classes,
both refused:

- **Unrepresentable leaf** — an image, raw HTML, a footnote. No ADF node exists.
  An image is the clearest case: ADF `media` addresses an attachment by id and
  cannot be minted from a URL.
- **Illegal placement** — a table inside a list item, a nested blockquote, a
  heading inside a list item. The nodes exist; ADF's schema forbids the nesting.
  ADF permits a list item to contain only a paragraph, a bullet list, an ordered
  list, a code block or a `mediaSingle`. Left unchecked this reaches Jira as a
  400, which tells the caller nothing.

**There is no `--force` for this refusal, and no flag is added.** The content
being refused is the caller's own draft, still in hand, trivially rewritten
without the image or the nesting. There is nothing to force past, only text to
fix. This is the decisive difference from the Replacement guard below, whose
`--force` exists because the content at risk belongs to someone else and cannot
be recovered.

Because there is no choice to make, the refusal throws from `toAdf` itself
rather than from a policy layer. A function with no override to weigh does not
need one.

The message names the construct, and for a placement failure names where it sat,
so that the response is a rewrite rather than a guess.

### The Replacement guard

The guard ADR 0003 asked for survives, with its trigger unchanged and its
mechanism replaced.

It continues to fire only on a **Replacement** — editing a Description, editing
a Comment — and never on creation, which has nothing to destroy. That
generalisation already exists: the refusal has one home, parameterised by
subject and flag, shared by `ergon edit` and `ergon comment`.
`specs/edit-issue-fields.md` further narrowed it to fire only when the
Description is actually being written, and that narrowing stands.

What changes is the question it asks. Today it asks "does this document contain
a node type outside `doc`, `paragraph`, `text`, or any mark?" — a set that is
about to widen enormously, and a question that has never looked at attributes.
That is now unsafe: a human-authored table with **merged cells** contains only
`table`, `tableRow` and `tableCell`, all of which become Expressible, so a
type-level check waves it through and `colspan` vanishes with no `--force`
prompted and no undo.

So the guard becomes the round trip itself: **a document may be replaced when
rendering it to markdown and parsing it back yields the same document.** There
is no list to maintain, it cannot drift as ADF grows, and it catches attributes,
placement and ordering in one stroke. `unsupportedAdfNodes` and
`SUPPORTED_NODES` are deleted; nothing is left for them to answer.

Comparing in **markdown space** — rendering, round-tripping and comparing the
two strings — is rejected explicitly. It looks like it dissolves the
normalisation problem below, and it destroys the guard: a panel renders to a
blockquote, re-parses as a blockquote, and renders identically, so the panel is
gone and the comparison is silent.

### Sameness

Real Jira ADF differs from anything `toAdf` emits in ways that carry no authored
meaning, so the comparison needs a definition of sameness. It is **directional
containment**: _the original may carry nothing `toAdf` would not have produced._

For each node, type and the attributes `toAdf` emits for that type are compared;
any **extra** attribute in the original is a difference. `colspan` is caught
because `toAdf` never emits it. `layout: "default"` and `order: 1` are caught
for the same reason, which is conservative and acceptable — it refuses a write
rather than losing one.

Containment is chosen over normalise-both-sides-then-compare because it is a
statement of the property rather than a list of cases. Every attribute Atlassian
adds in future is authored content until proven otherwise, which is the safe
default; a curated normalisation list has the opposite default.

Exactly one category is stripped by rule rather than by taste: **Jira-minted
identity**, meaning `localId`. It is generated by Jira, carries nothing the
operator wrote, and is not authored content. The category is about provenance,
so it does not grow with the schema.

Two structural normalisations are unavoidable, since neither is an attribute:

- Adjacent text nodes carrying identical marks are coalesced on both sides. Jira
  may split a run that `toAdf` emits whole.
- Mark arrays are compared without regard to order.

### Literal text

There is no way to write literal, unformatted text, and no flag is added for
one.

This is a real regression and is documented rather than mitigated. Today
`ergon edit --description - < deploy.log` writes the log verbatim; afterwards a
line beginning `#` becomes a heading and a diff hunk beginning `-` becomes a
list. The escape hatch is markdown's own: fence it.

A `--literal` flag is rejected on the same reasoning that rejected an opt-in
`--markdown` flag: a caller who must remember a flag will forget it, so the flag
buys nothing the forgetful case needs while adding a second format mode to a
tool that now has one. It would also buy that caller nothing three backticks do
not.

### Scope across fields

Markdown is the format for every ADF-backed field — Description, Comment body,
worklog comment. The read side is already uniform, since issue and Comment
mapping both go through `renderAdf`; making the write side non-uniform would
leave a second field in exactly the state ADR 0004 was written to fix.

The rule is defined for every field; only what exists is implemented.

### Modules

Two pure modules change. No new module, and no new seam.

- **The ADF module** gains the parser and the mapping, has `renderAdf`'s
  separator and table output corrected, and loses `fromAdf`,
  `unsupportedAdfNodes` and `SUPPORTED_NODES`. `fromAdf` existed only because
  `renderAdf` was not `toAdf`'s inverse — ADR 0004 is explicit that keeping the
  renderer out of the write path was load-bearing. Under the Expressible set the
  renderer _is_ the write path's inverse, deliberately, so the wall has nothing
  on either side of it. Its callers move to `renderAdf`.

  The module ends up with three exports:

  ```
  toAdf(markdown)  -> doc                 // throws when not Expressible
  renderAdf(doc)   -> { text, degraded }  // canonical markdown
  canReplace(doc)  -> { ok, differences } // the round trip, contained
  ```

  It roughly doubles in size and stays one file. The Expressible set is only
  checkable by a reader when the two mappings sit adjacent, and splitting on a
  line-count estimate before the code exists is speculative structure.

- **The rewrite guard module** keeps its shape, its `--force` policy and its
  editor carve-out, and swaps the question it asks from `unsupportedAdfNodes` to
  `canReplace`. Its message changes from a list of node types to prose naming
  the difference — "a table cell's merged columns" rather than a structural path
  — because ADR 0003's case for refusing rested on refusals being actionable.

Command modules change only at their call sites. The editor buffer's temp file
suffix moves from `.txt` to `.md`.

### Delivery

Two commits, cut at the seam between format and behaviour.

1. **The mirror pair.** Canonical `renderAdf`, table promotion, the parser and
   mapping, the unexpressible refusal, and the property test that proves the two
   directions inverse. Carries ADR 0010 and the `CONTEXT.md` changes, since both
   describe the format.
2. **The guard.** `canReplace`, the deletions, the rewrite guard's new question
   and message, and the `.md` suffix.

The two mappings cannot be split further. The property test is what proves the
invariant, and it cannot pass until both halves exist; a commit holding only one
half is a state where the two directions disagree, which is the bug.

`CHANGELOG.md` gets an entry per commit. ADR 0010 supersedes ADR 0003 and ADR
0004 rather than amending them, and both gain a superseded-by note.

## Testing Decisions

A good test here exercises what a caller receives — the document written, the
text read out, the verdict on a replacement — not how the mapping walked the
tree. Command modules are not unit-tested; they need live Jira, which is the
precedent in `specs/move-issue-status.md`, `specs/edit-issue.md` and
`specs/comment-on-issue.md`.

Both seams already exist and already have test files. There is no new seam.

1. **The ADF module** — `tests/adf_test.ts`. Markdown in, document out; document
   in, markdown out; document in, replacement verdict out.
2. **The rewrite guard** — `tests/rewrite_test.ts`. Guard input in, refusal or
   silence out. Its existing cases hold; the fixtures widen, since a document
   made of a bullet list is now writable and must stop being refused.

Prior art: `tests/adf_test.ts` already tests the ADF helpers as pure functions
over fixtures; `tests/rewrite_test.ts` already tests the refusal as a pure
policy; `tests/comments_test.ts` tests a mapping as a contract.

The centre of the testing is **one generator and one property**. The generator
produces ADF documents drawn from the Expressible set. The property is that
rendering one to markdown and parsing it back yields the same document, under
the containment relation above.

That single property does two jobs. It is the round-trip guarantee, and it is
the proof that the replacement guard never refuses a document ergon can write —
which is what keeps a fail-closed guard from becoming a guard that refuses
everything. Every generated document that passes is a document `ergon edit` will
open.

Generation is over ADF rather than over markdown deliberately. The writable node
table is a finite grammar and generates cleanly; generating _canonical_ markdown
would mean reimplementing `renderAdf`'s formatting rules inside the generator,
and testing a function against a copy of itself proves nothing.

The guarantee is stated semantically, not byte-wise. Markdown has synonyms —
`_x_` and `*x*`, `+ item` and `- item`, setext and ATX headings — so promising
byte-identity would be a documented lie the first time an agent writes `_x_`.
Meaning survives; spelling canonicalises.

A hand-written corpus sits alongside the property, covering what a generator
cannot reach:

- Each Expressible construct written as markdown, asserted as the document it
  should become: heading levels one to six, nested bullet and ordered lists, an
  ordered list with a start other than one, a task list with both states, a
  fenced block with and without a language, a blockquote, a rule, a table, and
  each mark including a mark nested inside a link.
- Markdown in a non-canonical spelling, asserted to produce the same document as
  its canonical form, and to read back canonicalised.
- Each unexpressible leaf — an image, raw HTML, a footnote — refused, with the
  construct named.
- Each illegal placement — a table inside a list item, a nested blockquote, a
  heading inside a list item — refused, with the placement named.
- A document of plain paragraphs, asserted to render and re-parse identically,
  which is the case that must not regress.
- A table with merged cells, refused by the guard — the case a type-level check
  would have waved through.
- A table without merged cells, permitted by the guard.
- A panel, a mention, and a media node, each refused by the guard, each rendered
  with its text intact and its type reported Degraded.
- A document carrying `localId`, permitted by the guard, proving the provenance
  rule.
- A document whose text is split across adjacent nodes with identical marks,
  permitted, proving coalescing.
- A document whose marks arrive in a different order, permitted.
- An absent and an empty document, both reading out as no body.

Read-path contract tests — `tests/issues_test.ts`, `tests/comments_test.ts`,
`tests/worklogs_test.ts` — have expected strings updated for blank-line
separation and for tables, and their `descriptionDegraded` / `bodyDegraded`
expectations updated where a table no longer appears. These are changed
assertions on existing seams, not new tests.

## Out of Scope

- **Widening the Expressible set to panels, media, expands, mentions, emoji,
  inline cards, dates or status lozenges.** These stay readable-and-Degraded and
  unwritable. Each needs either a Jira-side identifier ergon does not hold, or a
  markdown extension ergon would have to invent, and inventing syntax to carry
  them is the half-implemented converter ADR 0003 declined. The refusal path is
  the correct answer for now.
- **A raw-ADF escape hatch**, such as an `<adf>` block embedded in markdown. It
  is how the surveyed libraries handle their gaps; it puts a second, unvalidated
  format inside the first.
- **A `--literal` or `--plain` flag.** Covered above.
- **An opt-in `--markdown` flag.** Markdown is the format; a mode to leave it is
  a mode callers will forget to use.
- **Detecting markdown in a string to warn about accidental formatting.** ADR
  0004 already rejected the inverse guesswork, and the reasoning holds:
  descriptions legitimately contain lines beginning with `-`.
- **Versioning or a compatibility flag for the `renderAdf` output change.**
  Accepted as breaking.
- **Uploading an image so that `![alt](url)` could be expressed.** Attachment
  upload is a different feature with its own permissions story.
- **Changing what `--force` means.** Its trigger, its editor carve-out and its
  message shape are untouched.
- **Guarding creation.** `ergon new` and adding a Comment have nothing to
  destroy.
- **Unit tests for command modules**, per the standing precedent.
- **Splitting the ADF module.** Revisit once the code exists.
- **The Rust rewrite.** `docs/rust-rewrite-plan.md` is unmerged and its own
  decision gate concludes the case is weak. This spec targets the current
  codebase; the design survives a rewrite, the code does not.

## Further Notes

The three decisions that carry the most weight are all the same move: replacing
a maintained list with a definition. The Expressible set is defined as the
readable-without-Degrading set rather than enumerated. The guard is defined as
the computed round trip rather than a table of node types. Sameness is defined
as containment rather than a list of benign attributes. In each case the
alternative works today and drifts later, and drift here is unrecoverable — Jira
keeps no field-level undo, so a guard that quietly stops covering something
destroys content without reporting it.

The two refusals look alike and are not. Unexpressible markdown is refused with
no override because the caller holds the text; an unsafe Replacement is refused
with `--force` because the content belongs to someone else. Keeping `--force`
scoped to the second is what stops a caller who reaches for it for the first
reason from silently accepting the second.

The write-to-read guarantee does not protect against accidental formatting. An
agent that turns a log line into a heading by mistake will read that heading
back faithfully. The guarantee is about fidelity, not intent, and nothing in
this spec can tell the two apart.

Worth re-reading before implementing: ADR 0004's account of why `renderAdf`
never drops content silently. That rule is the reason reversing ADR 0003 is
defensible at all, and it applies verbatim to the new direction — a construct
the mapping cannot express becomes a named refusal, never a quiet omission.
