# No default Client SOW field id

The Client SOW is a Jira custom field whose id differs per project, so `ergon`
reads it from `defaults.projects.<KEY>.fields.clientSowFieldId`. Until now an
unconfigured project silently fell back to a hard-coded `customfield_10200` —
the id that happens to be correct in one Jira. We removed the fallback: a plan
that needs the field and cannot name it is an error.

The fallback made `ergon new` work with no configuration at all, which is
genuinely convenient for a personal CLI. It also meant the common path was
undeclared: every SOW written to that project went to a field nothing in config
mentioned. Guessing wrong is worse than it sounds, because Jira does not
complain — it silently omits unknown custom fields from `GET /issue?fields=`, so
an id that matches nothing degrades to an empty answer rather than a failure.
The result is a run that reports success while having read no SOW, or written
one to a field belonging to some other schema.

The trade-off is sharpened by `ergon client-sows`, which exists to answer "what
values will `ergon new` accept for this project?". A discovery command resting
on a guess answers confidently and wrongly for exactly the projects its caller
knows least about — the ones that were never configured.

Requiring the id only when it is actually used keeps the cost proportionate. A
project that never sets a Client SOW needs no configuration, because the `skip`
plan asks for no field. Reading the Parent's fields degrades the same way:
without a declared id, an issue inherits labels alone rather than erroring.

## Consequences

Configuration is now mandatory for any project that uses a Client SOW, and
existing installs must add `clientSowFieldId` to each such project before the
next `ergon new`. The failure is loud and names the key to add, so the migration
surfaces on first use rather than silently.

The decision covers Client SOW alone. `DEFAULT_SPRINT_FIELD_ID` still defaults
in `src/commands/new.ts`, which is deliberate rather than an oversight — no
discovery command depends on the sprint field's semantics, so it has not earned
the same strictness yet.

The "does this plan need a field?" question lives in one pure function,
`requireClientSowFieldId` in `src/commands/new_fields.ts`, so the boundary
between `skip` and everything else is stated once and covered by tests.
