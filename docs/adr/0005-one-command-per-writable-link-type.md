# One command per writable link type

Jira's issue links are a typed, directional, many-valued relation between two
issues, and this instance offers fourteen types — twenty-five distinct Phrases
once both directions are counted. ergon writes two of them, as
`ergon blocked-by` and `ergon duplicates`, and there is no generic
`ergon link --type <name>`.

The obvious design was the one ergon already uses twice. `ergon labels` feeds
`--labels`, `ergon client-sows` feeds `--client-sow`: a discovery command asks
Jira what it accepts now, and a flag takes one of the answers. Applied here that
gives `ergon link-types` feeding `ergon link A --to B --as blocks`, with the
Phrase carrying the direction so that nobody has to reason about Jira's inward
and outward ends. It generalises to all fourteen types for free and never
encodes a guess about which of them exist.

It was rejected because the premise behind that pattern does not hold for link
types. Labels and Client SOWs are project data: they are created and retired as
contracts and conventions change, which is exactly why `client_sows.ts`
deliberately bypasses the metadata cache. Link types are instance-level
configuration that ships with Jira, and this set has not changed in the twelve
years the instance has existed. Nobody adds a relationship of type "glazes
over". Discovering, every single invocation, a list that is effectively frozen
buys nothing, and paying for it in a flag whose valid values live behind a
second command is a worse interface than putting the two we use in `--help`.

Direction is carried by argument order rather than by a second command per type.
`ergon blocked-by PCK-1 PCK-2` reads "PCK-1 is blocked by PCK-2", and the
reverse relation is the same command with the arguments flipped, so no `blocks`
command is needed. Each type gets whichever of its two Phrases is the natural
thing to say: `blocked-by` rather than `blocks`, because the sentence you utter
standing on a ticket is "this is blocked by that", while `duplicates` takes the
outward Phrase because the new ticket is the one that duplicates the old.

Only `Blocks` and `Duplicate` are writable. `Relates` was considered and
dropped: it is the link people reach for when they have not decided what the
relationship is, and its absence costs nothing that the Jira UI does not already
do better. Jira's `Cloners` links are created by Jira's own Clone action, so a
command for them would rarely fire. The remaining nine types belong to Gantt and
Polaris plugins that this team does not use.

## Consequences

The command surface is a contract. Once agents are taught `ergon blocked-by`
through the `jira` skill, renaming or restructuring it breaks them, which is a
sharper commitment than a flag value would have been.

Writing is narrower than reading, as it already is for Descriptions — see
[ADR 0004](./0004-descriptions-read-richer-than-they-write.md). `ergon get`
renders every Link Jira reports, including `relates to` and the plugin types, so
an issue can display Links that no ergon command could have created and none can
remove. Removing those stays a job for the Jira UI.

A vocabulary collision disappears rather than needing a guard. This instance
carries a link type named Parent-Child, whose Phrases are "is parent of" and "is
child of", and which is not ergon's Parent — it sits in no hierarchy, drives no
Inherit, and puts nothing under an epic. A generic `--as` flag would have made
`--as "is parent of"` reachable, and reachable meant it needed an error
explaining itself. With no `ergon parent-of` command there is nothing to guard.

Adding a third writable type means adding a command, not extending an enum. That
is the intended cost: it forces the question of whether the relation is one
worth teaching, rather than letting fourteen types in because the plumbing
already supported them.
