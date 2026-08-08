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
