# Board order belongs to the board, not the project

Supersedes [ADR 0009](./0009-rank-does-not-cross-boards.md).

ADR 0009 was right that Rank compares two issues only when they share a board,
and wrong about where boards are. It took a project to be a board, made
`--order rank` require `--project`, and so ordered PCK and PGR separately on the
grounds that they had never been ranked against each other. On this Jira they
had: PGR has no board of its own, and the Unified Client Board (26) spans PCK,
PGR and fifteen other projects. Its Sprints hold both projects' issues side by
side, dragged against each other. Ordering them per project discarded the one
cross-project comparison the operator had actually made.

It was also wrong about what a board shows. Raw Rank is not a board's order: a
scrum board groups by Sprint — the active one, then each upcoming one in the
board's sequence, then the backlog — and Rank orders only within a group. An
issue in the backlog ranked above the whole active Sprint sorted first under
`ORDER BY Rank`, and nobody looking at the board would ever have seen it there.
Worse, every closed ticket the operator ever had was still in the Rank order,
because this Jira's workflows never set a resolution and a filter on
`resolution = Unresolved` excluded nothing: `ls --project PCK --order rank` led
with tickets closed years ago.

So `--order board` replaces `--order rank`, and Board order is read from the
board: its own saved filter decides which issues are on it, the board's Sprint
sequence decides the groups, and Rank decides within them. A Done issue in an
open Sprint keeps its place, as it does on the board; a Done issue in no open
Sprint is off the board and out of the order. Each project's board is its
configured `sprintBoardId`. Without `--project`, every configured project must
name the same board, or the ordering is refused — that is ADR 0009's surviving
rule, restated as what it always meant: one board, not one project.

## Considered options

- **Keep `rank` as raw Rank and fix only the closed tickets.** Rejected: raw
  Rank still interleaves the backlog with the Sprint, which is the order no
  board shows, and per-project ordering still discards the cross-project drag.
- **Keep the name `rank` with the new meaning.** Rejected: the glossary now
  separates Rank (drag order within a group) from Board order, and a flag that
  silently changed meaning would keep the old reading alive.
- **Scope to the configured projects rather than the board's filter.** Rejected:
  an issue from another project on the same board was dragged among the
  operator's own work, and dropping it leaves a hole in the order.
- **Recognise parking Sprints such as "Good Ideas Archive" by name.** Rejected:
  ergon would be guessing intent from names a team renames at will. The board's
  own Sprint sequence already puts them last, and moving one is a drag away.

## Consequences

Board order is known only once the whole board is fetched, so `--limit` cuts the
ordered list rather than the query. An issue from a project ergon is not
configured for still takes its place, though its `sprints` stay Absent per
[ADR 0006](./0006-absent-means-not-fetched.md). A board whose filter is not
ordered by Rank has no Board order, and is refused.
