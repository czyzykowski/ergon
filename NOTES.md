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
