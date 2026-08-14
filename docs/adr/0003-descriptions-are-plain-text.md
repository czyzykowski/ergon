# Descriptions are plain text

Jira Cloud stores rich-text fields as Atlassian Document Format, a nested
document tree that expresses lists, code blocks, links, tables, panels, and
mentions. ergon writes only one shape of it: `toAdf` in `src/api/jira.ts` splits
a string on newlines and emits one paragraph per line. A Description is
therefore plain text as far as ergon is concerned, and `ergon edit` refuses to
rewrite one holding anything else unless `--force` says otherwise.

The alternative was a markdown converter, so that lists and code fences survive
a round trip. We declined it. ADF is a deep format and a half-implemented
converter is worse than none — it silently drops the constructs it does not
know, which is the failure this decision exists to prevent. The write direction
alone would not be enough either: `ergon edit` prefills an editor from the
current Description, so a converter would have to be faithful in both directions
to be worth having.

Refusing rather than warning follows from who calls this. The tool is built to
be driven by agents as much as by a human at a terminal, and a warning printed
into a transcript nobody reads is not a safeguard. An error is recoverable in a
way a flattened Description is not: Jira keeps no field-level undo, so the
original document is gone the moment the PUT succeeds. Making the caller pass
`--force` turns the loss into something chosen rather than discovered later.

## Consequences

Descriptions authored in the Jira web UI, where formatting is the default, are
largely off limits to `ergon edit`. That is the intended outcome and not a
temporary gap — the fix is to edit those in the web UI, or to accept the
flattening explicitly.

`--force` is deliberately not available on the editor path. Prefilling a buffer
from a document ergon cannot render faithfully would mean editing a corrupted
copy of the issue without being able to see what was already lost, so rich
content is editable only by supplying the replacement text outright.

Loss detection is a pure function over the fetched ADF: any node type outside
`doc`, `paragraph`, and `text` is content `toAdf` cannot reproduce. It is
covered by unit tests, unlike the command around it, which needs live Jira.

Nothing here is load-bearing for `ergon new`, which has flattened its
`--description` since it was written. This decision names the existing behaviour
and extends it to editing rather than changing it.
