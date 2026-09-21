# Descriptions read richer than they write

> **Superseded by** [ADR 0010](./0010-markdown-is-ergons-rich-text-format.md),
> which removes the asymmetry this ADR named: ergon now writes what it reads.
> The rule established here — never drop content silently — is what made
> reversing [ADR 0003](./0003-descriptions-are-plain-text.md) defensible, and
> 0010 applies it to the write direction verbatim.

[ADR 0003](./0003-descriptions-are-plain-text.md) declined a markdown converter
and settled that a Description is plain text as far as ergon is concerned. That
holds for writing. It does not hold for reading: `ergon get --json` now renders
any Description to markdown-flavoured text, however it was authored, while
`ergon edit` still refuses to rewrite one it cannot round-trip.

The asymmetry exists because the two directions fail differently. Writing a
half-understood document destroys it, and Jira keeps no field-level undo — the
original is gone the moment the PUT succeeds. Reading one destroys nothing; the
failure is an agent working from a body it misread. So 0003's argument, that a
half-implemented converter is worse than none, is an argument about the write
path only, and applying it to reads produced the outcome it was written to
prevent. `fromAdf` walks `doc > paragraph > text` and nothing else, so a
Description authored as a bullet list — the default shape of a ticket written in
the Jira web UI — read back as blank lines. An agent given that does not see an
error. It sees an issue with no instructions, and proceeds.

The renderer is therefore governed by one rule: it never drops content silently.
Anything whose structure it cannot reproduce still has its text emitted, and the
node types involved are named in `descriptionDegraded` alongside it. A table
loses its grid and keeps its cells; an attachment loses its image and keeps its
filename. A "too hard, skip it" branch would reintroduce the blank-body failure
for exactly the tickets most likely to have one.

The two directions keep two separate sets of node types, and `SUPPORTED_NODES`
in `src/adf.ts` is untouched. It answers "can `toAdf` produce this?", which is
the question `ergon edit`'s guard asks, and widening it to mean "can we show
this?" would loosen a destruction guard as a side effect of a change to reading.
`fromAdf` likewise stays exactly as `toAdf`'s inverse — `edit` reaches it only
for documents already proven plain, so the renderer cannot leak into the write
path.

## Consequences

The rendered output is one-way. Text read from `ergon get --json` and passed
back to `ergon edit --description` is written as flat paragraphs, so a real list
becomes text shaped like one. We document this rather than guard it: 0003's
refusals are grounded in inspecting the actual document tree, whereas detecting
markdown in a string is guesswork, and descriptions legitimately contain lines
beginning with `-`. Refusing a correct write to prevent a mistake we cannot
confirm is the worse trade.

`descriptionDegraded` is reported against the renderer's set, not the round-trip
set, so the two fields disagree by design. A bullet list is renderable but not
round-trippable: it renders cleanly with an empty `descriptionDegraded`, and
`ergon edit` still refuses it without `--force`.
