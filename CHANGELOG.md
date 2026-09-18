# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

- Fixed `ergon log --description`: the worklog comment now travels as ADF, so
  Jira stops rejecting the worklog as null.
- Added initial Deno CLI skeleton with Cliffy.
- Added YAML config loader with env var expansion.
- Added Jira API client with issue mapping and search helpers.
- Added Clockwork client for timers and worklogs.
- Added API check script for Jira and Clockwork.
- Added local state loader for last selections and timer metadata.
- Added start/stop/status commands wired to Jira and Clockwork.
- Added log/ls/search/new/menu commands.
- Added required field handling for new command (Client SOW, labels).
- Fixed epic prompt handling when selecting None.
- Fixed Jira issue mapping when API omits fields in create response.
- Added sprint selection when creating issues.
- Defaulted Client SOW prompt to last selected value.
- Defaulted sprint field to customfield_10010 for new issues.
- Fixed sprint payload to send numeric id.
- Sorted Client SOW options alphabetically.
- Prompted for Client SOW with default selection.
- Added Jira label checkbox selection with search.
- Cached Jira metadata for new issue prompts with a --no-cache option.
- Added search to epic selection prompt.
- Added state cache persistence tests.
- Fixed home directory resolution for state/config paths.
- Documented test permissions.
- Added coverage tasks.
- Added config/state tests.
- Added config validation coverage tests.
- Added additional state helper tests.
- Added config branch coverage tests.
- Fixed config parse error handling.
- Fixed temp directory usage in tests when env enabled.
- Updated test/coverage tasks for env permissions.
- Added Client SOW and label inheritance from the parent issue in
  `ergon new --non-interactive`, falling back to project config defaults. The
  epic counts as the parent when `--parent` is omitted.
- Added `--labels none` to create an issue with no labels.
- Changed `ergon new --non-interactive` to ignore the remembered Client SOW, so
  scripted runs resolve fields deterministically.
- Fixed `ergon new --non-interactive` dropping the Client SOW entirely unless
  `--client-sow` was passed.
- Fixed `ergon new` recording a remembered Client SOW it never applied.
- Removed the hard-coded `customfield_10200` fallback for the Client SOW field.
  A project that sets a Client SOW must now declare `clientSowFieldId`, and
  creating an issue fails with the key to add rather than writing to a guessed
  field. See [ADR 0002](./docs/adr/0002-no-default-client-sow-field-id.md).
- Added `ergon client-sows <PROJECT>` to list the Client SOW options a project
  accepts.
- Added `--json` to `ergon client-sows` and `ergon labels`.
- Added `ergon edit [ISSUE]` to change an issue's description and summary. With
  no flags it opens the current description in `$EDITOR`; `--description -`
  reads the body from stdin. It refuses to rewrite a description holding lists,
  code, tables, or formatting rather than flattening it silently — `--force`
  overrides. See [ADR 0003](./docs/adr/0003-descriptions-are-plain-text.md).
- Added `description` and `descriptionDegraded` to `ergon get --json`, so an
  agent can read what an issue asks for. Any description is rendered to
  markdown, whatever it was authored as, and anything whose shape markdown
  cannot carry keeps its text and is named in `descriptionDegraded`. Previously
  no command returned a body at all. See
  [ADR 0004](./docs/adr/0004-descriptions-read-richer-than-they-write.md).
- Added `labels`, `statusCategory`, `created`, and `updated` to the issue shape
  returned by `ergon get --json`. `statusCategory` is the stable key (`new`,
  `indeterminate`, `done`) rather than a per-project status name.
- Added `ergon blocked-by [ISSUE] BLOCKER` and
  `ergon duplicates [ISSUE] ORIGINAL` to link two issues, with `--remove` to
  take the link away. One key links the issue last worked on; the reverse
  relation is the same command with the keys flipped. There is no generic link
  command and no other link type is writable — see
  [ADR 0005](./docs/adr/0005-one-command-per-writable-link-type.md).
- Added `links` to `ergon get`, in both the plain output and `--json`. Every
  link type Jira reports is shown, including ones no ergon command can create,
  each labelled with the phrase that reads from the issue asked about.
- Changed Jira API failures to report Jira's own `errorMessages` rather than the
  status code and raw response body, falling back to the raw body when there is
  nothing to unwrap.
- Added `ergon comments [ISSUE]` to read an issue's comments as a thread, with
  `--json` for the whole history as data. Bodies render however they were
  authored, naming anything the terminal could not reproduce, and every page is
  fetched so a partial history never reads as a whole one.
- Added `ergon comment [ISSUE]` to append a comment to an issue. `--body` takes
  it inline, `--body -` from stdin, and with neither the editor opens on an
  empty buffer. The receipt names the new comment's id, and `--json` returns the
  comment itself.
- Added `ergon comment [ISSUE] --id <ID>` to edit a comment already on an issue,
  opening its current text in `$EDITOR` or replacing it with `--body`. It
  refuses to rewrite a comment holding lists, code, tables, or formatting rather
  than flattening it silently — `--force` overrides, but not on the editor path.
  A comment's visibility restriction is preserved and named in the receipt.
- Fixed `--sprint current`, which resolved from a cache that never expired and
  so kept naming a sprint that had closed months earlier. The active sprint is
  now fetched at the moment of the write and never cached.
- Changed `--sprint current` to refuse a project with several boards and no
  configured `sprintBoardId`, rather than silently taking whichever board Jira
  returned first. It is the refusal `--sprint <name>` already made.
- Added `ergon ls --json`, emitting an array of the same issue shape
  `ergon get --json` returns, so a sweep is one request rather than one per key.
- Added `ergon ls --order rank|updated`. `rank` is the board's own order and
  requires `--project`; `updated` stays the default.
- Added `ergon ls --since YYYY-MM-DD`, bounding a list to issues that have
  moved.
- Added `priority`, `dueDate`, `sprints` and `clientSow` to the issue JSON. A
  field ergon did not fetch is now missing from the JSON rather than empty, so
  `links` has no key at all on an issue that came from a search.
- Changed configuration: a project declared under `defaults.projects` must now
  declare `fields.sprintFieldId`, checked when config loads. The hard-coded
  `customfield_10010` fallback in `ergon new` is gone.
- Added `ergon edit --due <YYYY-MM-DD|none>` and
  `ergon edit --sprint <current|none|id|name>`, so a board gap found by a sweep
  can be closed with one command.
- Changed `ergon edit`: naming a field writes that field and never opens an
  editor, where `--summary` used to open one. A bare `ergon edit` still opens
  the description. The description is fetched, and ADR 0003's refusal applied,
  only when the description is in play.
- Added `ergon worklogs [--date YYYY-MM-DD] [--json]`, a day's logged time
  broken down by issue with start times, descriptions and a total.
- Fixed `ergon status` totals, which came from the Clockwork timer alone and so
  omitted every hour logged with `ergon log` or typed into the Jira UI. Today's
  total now comes from Jira, from the same reading `ergon worklogs` renders.
