# Absent means not fetched

`ergon get --json` and `ergon ls --json` hand out the same `JiraIssue`, but they
do not fetch the same thing. `getIssue` asks Jira for an issue with no `fields`
parameter and receives everything; `search` asks for the named `SEARCH_FIELDS`
and receives those. The gap is not an accident of the API — Jira will return
`issuelinks` from a search if asked — it is a deliberate refusal to pull a link
graph for every row of a twenty-issue list.

A field ergon did not fetch is now **Absent** from the JSON: the key is not
there at all. A field it fetched and found empty is `null`. The two are
different facts and they now look different.

The alternative was to keep one flat shape and let the unfetched field take its
empty value — `links: []` from a list, `sprints: []`, `clientSow: null`. It is
smaller, and it is what most CLIs do. It is also a silent lie of exactly the
kind the rest of ergon's language is built to avoid. A Description read out with
its tables flattened is marked **Degraded** rather than quietly simplified,
because "whatever was flattened is named alongside the text". `links: []` from a
search says "this issue has no Links" to a consumer that has no way of knowing
otherwise, and the consumer that prompted this decision — the `standup` skill —
acts on what it reads.

The same distinction settles a case that looked unrelated. A project whose
Client SOW field id is not configured cannot have its Client SOW read at all;
ergon does not know where to look. That is not an empty field, it is an unasked
question, and it is Absent for the same reason a Link from a search is. The
codebase already modelled it that way before this decision existed:
`parentFieldsFrom` returns `clientSow: undefined` when no id is declared,
precisely so a project with no configuration does not read as a project with no
SOW.

There is a limit to how far this can be pushed, and it is worth stating so the
guarantee is not overread. [ADR 0002](./0002-no-default-client-sow-field-id.md)
records that Jira silently omits unknown custom fields rather than failing, so a
field id that is configured but _wrong_ comes back looking exactly like a field
that is empty. Absent distinguishes the case ergon can detect. It cannot
distinguish the case Jira refuses to report.

## Consequences

Consumers read an optional key rather than a present-but-empty one, which is one
extra check in `scripts/sweep.py` and in anything else parsing `--json`.

`ls --json` never carries `links`. Closing that gap by adding `issuelinks` to
`SEARCH_FIELDS` was considered and rejected: it makes every list fetch link
graphs to satisfy a symmetry no caller consumes, and the honest thin answer is
better than the expensive identical one.

`mapIssue` becomes an exported, tested function. It was private while
`ergon
get` was the only caller and its output was read by a human; it is now a
contract, and this repo's rule is that contracts get tests — the same line
`mapComment` crossed for the same reason.
