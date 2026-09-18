# Rank does not cross boards

`ergon ls --order rank` emits `ORDER BY Rank ASC`, and JQL will happily apply it
to a query spanning every project the operator is assigned in. The result is a
total order that is stable, plausible-looking, and meaningless in half its
comparisons.

Rank is set by dragging, and dragging happens within a board. Putting PCK-12
above PCK-30 writes a rank between that board's neighbours. Nothing the operator
has ever done expresses how PCK-12 ranks against PGR-7. The values are globally
comparable because they are one field, so Jira will interleave two boards
without complaint, but the interleaving carries no intent.

`ergon ls --order rank` therefore requires `--project`. Without a scope it is an
error that names the fix.

This matters because of the claim the ordering is about to be used to make. The
`standup` skill orders the day from the board, on the stated principle that the
board is the single source of priority. Its sweep is the unscoped
`assignee = currentUser()` query across both configured projects — the exact
case where rank interleaves two boards that have never been ranked against each
other. Presenting that as board order would be ergon inventing a fact and the
skill repeating it.

The cost is friction on a personal CLI: `ergon ls --order rank` at a terminal,
where the operator knows perfectly well what they meant, now errors. That was
weighed against an ordering that looks authoritative and is not, and the error
won — a caller who wants a cross-project list can still have one in `updated`
order, which is arbitrary in a way that announces itself.

The consumer is pushed into stating its own rule, which is the secondary
benefit. `standup` must now fetch each project's rank order and merge them by
something it chooses and can explain — Sprint, then due date, then Rank within a
project — rather than inheriting an arbitrary merge it cannot see.

## Consequences

`--order rank` without `--project` is an error. `--order updated`, the default,
is unrestricted.

`--sprint` does not imply `--order rank`, though sprint order is rank order
within a board. `--sprint` spans projects, so the implication would either
contradict this decision or apply only when `--project` happened to be present —
an ordering that changes with an unrelated flag and cannot be explained in one
line of `--help`.

Consumers wanting a cross-project ordered list make one call per project.
