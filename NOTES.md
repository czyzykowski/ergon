# Notes

## Progress

- [x] 6.0 Project setup (flake.nix)
- [x] 6.1 CLI skeleton
- [x] 6.2 Config loader
- [x] 6.3 Jira client
- [x] 6.4 Clockwork client
- [x] Add API check script
- [x] 6.5 Local state
- [x] 6.6 Commands (start/stop/status)
- [x] 6.6 Commands (log/ls/search/new/menu)
- [x] New command required fields (Client SOW, labels)
- [x] Parent inheritance for Client SOW and labels (non-interactive)
- [x] Editing an issue's description and summary (`ergon edit`)
- [x] Reading an issue's description via `ergon get --json` (`renderAdf`)
- [x] Commenting on an issue (`ergon comment`, `ergon comments`)
- [x] Listing issues as data (`ergon ls --json`, `--order`, `--since`)
- [x] Editing an issue's due date and sprint (`ergon edit --due`, `--sprint`)
- [x] Reading a day's logged time (`ergon worklogs`)

## Updates

- Fixed epic prompt None selection in `ergon new`.
- Guarded Jira issue mapping against missing fields in create response.
- Added sprint selection flow for `ergon new`.
- Remembered last selected Client SOW in state.
- Default sprint field set to customfield_10010 for create.
- Send numeric sprint id payload for create.
- Sort Client SOW selections alphabetically.
- Prompt Client SOW with last selection default.
- Added Jira label checkbox selection with search.
- Cached Jira prompt metadata with a no-cache flag.
- Added search to epic selection prompt.
- Added tests for state cache persistence.
- Adjusted home directory resolution for config/state paths.
- Documented test permissions in README.
- Added coverage tasks for reporting.
- Added tests for config/state helpers.
- Added config validation test coverage.
- Added additional state helper tests.
- Added config branch coverage tests.
- Fixed config parse error handling for tests.
- Fixed temp directory usage in tests when env enabled.
- Updated test/coverage tasks for env permissions.
- Jira silently omits unknown custom fields from `GET /issue?fields=`; it does
  not error, so an unconfigured `clientSowFieldId` degrades to no inheritance.
- Client SOW/label precedence for `ergon new` lives in one pure function,
  `resolveFields` in `src/commands/new_fields.ts`, covered by
  `tests/new_fields_test.ts`.
- Non-interactive runs neither read nor write `state.lastClientSow` — see
  `docs/adr/0001-non-interactive-ignores-remembered-state.md`.
- Interactive behaviour of `ergon new` is deliberately unchanged by the
  inheritance work; only `--non-interactive` gained new precedence rules.
- `deno lint` fails repo-wide on `no-import-prefix` for the `https://` std
  imports in `tests/`; pre-existing, not addressed here.
- The Client SOW field id has no default. `requireClientSowFieldId` in
  `src/commands/new_fields.ts` decides when a missing id is an error: every plan
  kind but `skip` needs one — see
  `docs/adr/0002-no-default-client-sow-field-id.md`.
- `~/.config/ergon/config.yaml` previously relied on the removed fallback for
  PGR; `clientSowFieldId: customfield_10200` was added there to match.
- `DEFAULT_SPRINT_FIELD_ID` deliberately still defaults — ADR 0002 covers Client
  SOW only.
- `ergon labels` and `ergon client-sows` deliberately bypass the metadata cache.
  The cache has no expiry, and a discovery command answering from stale data is
  worse than not having one: the caller cannot tell it is stale.
- `ergon client-sows` takes the project positionally and never reads
  `state.lastProject`, so its answer depends on config alone.
- `--json` narrows Client SOW options to `{id, value}`; Jira also returns
  `disabled`, which is dropped so the shape stays a contract.
- ADF handling moved out of `src/api/jira.ts` into `src/adf.ts` so the pure
  parts are testable without the client: `toAdf`, its inverse `fromAdf`, and
  `unsupportedAdfNodes`, which decides whether `ergon edit` may proceed.
- `unsupportedAdfNodes` counts marks as well as node types. A bold run is an
  ordinary `text` node carrying `marks: [{type: "strong"}]`, so checking node
  types alone would let formatting be flattened without a word.
- `ergon edit` reads the raw ADF through `getIssueFields(key, ["description"])`
  rather than `getIssue`, because loss detection needs the document itself and
  `JiraIssue.description` is text by the time `mapIssue` is done with it.
- Jira clears a rich-text field with `null`; an ADF doc with empty content is
  rejected. `ergon edit --description ""` therefore sends `null`.
- `edit` reads `state.lastIssueKey` but never writes it, matching `move`.
  Commands that act _on_ an issue do not claim the slot; only ones that switch
  _to_ an issue (`new`, `start`, `log`) do.
- `renderAdf` is a second, read-only ADF renderer alongside `fromAdf`. They are
  not redundant: `fromAdf` is `toAdf`'s exact inverse and exists so `ergon edit`
  can prefill a buffer it can write back, while `renderAdf` reads any document
  for `ergon get --json`. Reading and writing fail differently, which is the
  whole of
  [ADR 0004](./docs/adr/0004-descriptions-read-richer-than-they-write.md).
- `renderAdf` joins blocks with a single newline rather than a blank line, so a
  Description made only of paragraphs renders byte-identically to `fromAdf`. A
  plain issue therefore reads the same through `get` as through `edit`.
- Unknown ADF node types are not skipped. `renderAdf` names the type in
  `degraded` and recurses into its content anyway, deciding inline vs block by
  whether any child is an inline type. A future Jira node keeps its text.
- `descriptionDegraded` and `unsupportedAdfNodes` answer different questions and
  will disagree. A bullet list renders cleanly (empty `descriptionDegraded`) yet
  `ergon edit` still refuses it, because `toAdf` cannot produce one.
- `mapIssue` reports `description: null` for both an absent field and an empty
  document. Jira makes no distinction either — clearing one writes `null`.
- `getIssue` sends no `fields` param, so it already returned `labels`,
  `created`, `updated`, and `status.statusCategory`; only `search` needed
  `SEARCH_FIELDS` widening. `description` was being fetched on both paths and
  dropped by `mapIssue` all along.
- `statusCategory` carries the category key, not its name. `ls` already
  hardcodes `"Ready for QA", "Ready for UAT", "UAT", "QA"` because status names
  are per instance; the key is the part that means the same everywhere.
- Jira's link record names its two ends backwards from what they suggest. In a
  `POST /rest/api/3/issueLink` body the `inwardIssue` is the end that reads with
  the type's _outward_ phrase, so `{inwardIssue: A, outwardIssue: B}` on type
  Blocks means **A blocks B**. Verified against a real link and both issues'
  changelogs. Atlassian's own docs call `outwardIssue` "the from issue", which
  reads the opposite way and is wrong; `createLinkBody` in `src/links.ts` is the
  only place that has to know.
- The per-issue view uses the opposite convention to the record. On issue X, an
  `issuelinks` element carrying the counterpart in `outwardIssue` reads "X
  ⟨type.outward⟩ Y", and one carrying it in `inwardIssue` reads "X ⟨type.inward⟩
  Y". Exactly one of the two is ever present. So an issue is the record's
  `inwardIssue` precisely when its own element holds the counterpart in
  `outwardIssue`.
- Creating a link twice is a silent no-op: Jira answers `201` with an empty body
  and creates nothing. It returns no link id either — the only way to learn one
  is to re-read `issuelinks`. `blocked-by` and `duplicates` therefore read the
  subject's links first, which is what lets them say "already" instead of
  reporting a create that did nothing.
- `POST /rest/api/3/issueLink` answers `404` for five different situations:
  linking disabled site-wide, either issue unviewable, no Link Issues
  permission, either key missing, or the type missing. The status cannot tell
  them apart, so the target is read first — a mistyped key then names itself
  rather than arriving as an unattributed 404.
- `getIssue` sends no `fields` param and so already returned `issuelinks`;
  `mapIssue` dropped it, the same way it dropped `description`. `SEARCH_FIELDS`
  does not list it, which is deliberate — `ls` and `search` would otherwise
  carry a links payload on every row.
- Link types are instance-level and effectively frozen; this instance's fourteen
  have not changed in twelve years. That is the whole argument for hardcoding
  commands rather than discovering types, and it is why the labels/client-sows
  pattern does not apply here. See
  [ADR 0005](./docs/adr/0005-one-command-per-writable-link-type.md).
- Every inward and outward phrase in this instance is unique across all fourteen
  types, so a phrase identifies a type and a direction on its own. Three types
  are symmetric (`Relates`, `Gantt End to End`, `Gantt Start to Start`) and read
  identically either way.
- `blocked-by` and `duplicates` read `state.lastIssueKey` but never write it,
  matching `move` and `edit`.
- The `$EDITOR` buffer lives in `src/editor.ts` rather than inside `edit`,
  because both `edit` and `comment` open one. Only three things vary — the
  starting text, what names the buffer, and the sentence thrown when no editor
  is set — so the decision of whether anything came back worth writing stays in
  one place. `comment` starts from an empty buffer, which is why the starting
  text is a parameter rather than a field read beforehand.
- `ergon comment` has `--json` where `ergon edit` deliberately does not, and the
  two are principled rather than inconsistent. The test is not "do mutations
  return data" but "did this mutation mint an identifier the caller must now be
  able to name". `edit` rewrites fields whose values the caller already holds;
  `comment` creates an id that did not exist and that editing later requires.
  Without it an agent would have to regex the id out of a receipt.
- ADR 0003 and ADR 0004 were extended to Comments deliberately, and needed no
  new reasoning: a Comment is a second rich-text field under decisions already
  written for the first. ergon writes paragraphs, reads anything, and refuses to
  rewrite what it cannot reproduce. `ergon comments` therefore lists a Comment
  that `ergon comment --id` will still refuse to edit — the same disagreement
  ADR 0004 already documents between `descriptionDegraded` and
  `unsupportedAdfNodes`.
- A Comment's `visibility` is echoed back verbatim on update rather than
  omitted. Atlassian does not document the omission behaviour, and the field
  evidence is that a body-only PUT _clears_ an existing restriction — dropping
  the key is the reported way to unrestrict a comment. Omitting it would widen
  who can see a note, silently, on a 200. `jsdPublic` is ignored outright: it is
  a Jira Service Management construct and there are no JSM projects here.
- cliffy 0.25.7 rejects an empty string for any `<value:string>` option with
  "Missing value for option", before the action runs. So `--body ""` errors, as
  the Comment design wants, but `ergon edit --description ""` cannot clear a
  description the way README claims — pre-existing, untouched here.
- What may be cached: epics, labels, boards and Client SOW options — facts that
  change when someone changes Jira's configuration. Which sprint is active is
  not one of them, and caching it left `--sprint current` writing a closed
  sprint for months. A TTL was rejected: any TTL is wrong at a sprint boundary,
  which is the one moment the answer changes and the one moment it matters. The
  rule now lives in `CONTEXT.md`'s **Cache** entry.
- ergon writes time through Clockwork and reads it back from Jira. The asymmetry
  looks like an oversight and is not: Clockwork is a Jira app, so its timers
  land as Jira worklogs, and Jira also sees `ergon log` and anything typed into
  the Jira UI. Clockwork sees one of the three. Reading both and reconciling was
  rejected — it adds a matching rule that exists only to be got wrong when one
  source is a superset of the other. See ADR 0008.
- Jira has no by-user-by-date worklog read. A day costs a JQL search for the
  issues carrying this author's worklogs on the date, then one worklog read per
  issue found. A normal day is a handful of requests, paid by `status` and
  `worklogs`, neither of which is on a hot path.
- `ClockworkClient.getWorklogs` is now unused, and with it `clockwork.userQuery`
  in config and `ClockworkWorklog`'s read side. Left in place rather than
  removed as unrelated cleanup; the timer path still uses the rest of the
  client.
