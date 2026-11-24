# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

- An Interactive `ergon new` parent search finds text containing a backslash.
  Before, the backslash went into the JQL unescaped, so a search ending in one
  was refused by Jira.

- `ergon new --sprint "Sprint 5"` files into the active sprint of that name
  without a terminal, as `ergon edit --sprint` already did, and at a terminal
  finds it without asking for a board. Before, a Non-interactive run was refused
  with "Resolving --sprint by name needs interactive mode", and an Interactive
  one asked which board first. A name no board has active fails with
  `Active sprint "<name>" not found.`, as on `edit`.

- `ergon new --no-cache` asks Jira for every lookup and leaves the saved Cache
  as it was, as its help text says. Before, the flag did nothing: the Cache was
  always read and always saved.

- An Interactive `ergon new` whose Parent or Epic has no labels takes the
  project's configured labels, as a Non-interactive run already did, and asks
  for labels only when neither `--labels`, the Parent nor the config gives any.
  Before, an unlabelled Parent or Epic skipped the configured labels and a
  person at a terminal got a label prompt.

- An Interactive `ergon new` takes its labels and Client SOW from the Epic it
  files under when there is no `--parent`, as a Non-interactive `--epic` already
  did. An Epic picked at the prompt, passed with `--epic` or remembered from the
  last run gives the new issue its labels without asking for them, and its
  Client SOW is the default the Client SOW prompt offers, ahead of the one last
  used. Before, a person at a terminal got a label prompt and no Epic default.

- `ergon new` run without a terminal on both stdin and stdout — piped, captured,
  or started by a script or agent — is Non-interactive without
  `--non-interactive`, exactly as if the flag had been passed: it never prompts
  and neither reads nor writes the remembered Client SOW. Before, such a run
  hung silently at its first prompt. Where it lacks a project or a summary it
  fails naming the flag: "Project key is required; pass --project." and "Summary
  is required; pass --summary.". `--non-interactive` stays, for a run at a
  terminal that should not prompt.

- `ergon move` and `ergon menu` run without a terminal fail instead of waiting
  on a prompt nobody can answer. `ergon move <key>` without `--to` fails with
  "Target status is required; pass --to." before calling Jira; an unknown `--to`
  still lists the available transitions. `ergon menu` refuses to start with
  "ergon menu needs a terminal.". At a terminal both prompt as before.

- `ergon edit` with no field flag, and `ergon comment` with no `--body`, fail
  without a terminal instead of opening `$EDITOR`, which hung the run even with
  `$EDITOR` set. `edit` names its field flags ("A field to edit is required;
  pass --summary, --description, --due, --sprint or --assignee."), `comment`
  names `--body` ("A comment body is required; pass --body."), whether adding a
  comment or editing one with `--id`. Both refuse before calling Jira. At a
  terminal both open the editor as before.

- A Non-interactive `ergon new` no longer defaults the project to the one last
  used, nor records its project and epic for the next run. It takes the project
  from `--project`, then config's default project, and otherwise fails with
  "Project key is required; pass --project." Before, a script that omitted
  `--project` filed its issue wherever the operator last worked. Interactive
  runs still default from, and record, the last project and epic; every run
  still records the issue it created for follow-up commands.

- `ergon search --json` emits the matching issues as the same array
  `ergon ls --json` does: `links`, `reporter`, `statusSince` and `children`
  Absent, as from any search. An empty result is `[]`; without `--json` it stays
  `No issues found.`

- `ergon search --project` refuses a project ergon has no configuration for,
  naming the key to add, as `ergon ls --project` does. Jira answers a project
  key it does not know with no issues rather than an error, so a typo read as
  `No issues found.` Searching without `--project` still finds issues in any
  project.

- `ergon new` prints the new issue's summary after its key. It printed
  `Created PGR-2009:` with nothing after the colon, interactive or not.

- `ergon get` names the issue's Reporter — who Jira records as asking for it.
  `--json` carries `reporter` as a display name: `null` when Jira reports none,
  and Absent when Jira hides the name, as a comment's `author` is. Absent from
  `ls` and `search`. The human-readable output shows a `reporter:` line above
  `assignee:`, reading `(nobody)` or `(hidden)` in those two cases.

- `ergon new` and `ergon edit` take `--assignee me` to assign the issue to the
  account ergon runs as, and `--assignee none` to leave it or make it
  unassigned. Any other value is refused before anything is sent. Without the
  flag, `ergon new` leaves the issue to the project's default Assignee, as
  before; the Assignee is never inherited from the Parent.

- Help and `--version` are plain text: no ANSI colour codes, in a terminal or
  not.

- A usage error — an option missing its value, an unknown command or option —
  prints its message alone on stderr and exits 1. It used to print the whole
  help to stdout first, so a script capturing stdout got usage text instead of
  data.

- `ergon get` lists the issue's Children — every issue whose Parent it is, Done
  ones included, sorted by key and never capped. `--json` carries them as
  `children: [{ key, summary, issueType, status, statusCategory, assignee }]`;
  the human-readable output shows a `children:` block below `links:`. Absent
  from `ls` and `search`, and Absent with a warning on stderr when the Children
  cannot be searched.

- `ergon get --json` carries `statusSince`: when the issue entered the status it
  shows, as a UTC ISO instant — its last Transition (a change of status name,
  one within a category included), or `created` if it has never had one. Read
  from the full status changelog, so long-lived issues are not cut off at Jira's
  100-entry embedded changelog. Absent from `ls`, and Absent with a warning on
  stderr when the changelog cannot be read. The human-readable `ergon get` shows
  it as a `since:` date.

- Added `ergon sprints <PROJECT>`, which lists the project's open sprints —
  active first, then upcoming in board order — each once with the boards that
  show it, asked of Jira every run. `--json` gives
  `[{ id, name, state, startDate, endDate, boards: [{ id, name }] }]`, dates as
  ISO instants or `null`. A project with no scrum board errors; one with nothing
  planned lists nothing.
- `--sprint` help on `ergon new` and `ergon edit`, and the "Active sprint not
  found" and "Several active sprints" errors, now point at `ergon sprints`. A
  name is still matched among active sprints only; an upcoming sprint is written
  by id.

- `ergon comments --json` (and `ergon comment --json`) leave `author` out when
  Jira hides it, instead of giving `""`, matching `ergon attachments`. A hidden
  author is Absent: ergon does not know the name, which is not the same as there
  being none.

- Added `ergon attachments [KEY]`, which lists an issue's Attachments one line
  each — id, size, when, who, filename — oldest first. `--json` returns a bare
  array of `{ id, filename, mimeType, size, created, author }`, with `size` in
  bytes and `author` Absent when Jira hides it. No content URLs are given out:
  they need ergon's credentials.
- `ergon attachments KEY ID...` narrows the listing, and `--json`, to the named
  Attachments, still in Jira's order. An id that is not on the issue refuses the
  run, naming every unknown id. The first argument is always the issue key.
- `ergon attachments KEY [ID...] --download <dir>` fetches the selected
  Attachments into `<dir>`, creating it if missing, each as `<dir>/<id>-<name>`,
  where `<name>` is Jira's filename reduced to a safe basename, so no filename
  can write outside `<dir>`, and stripped of control characters. A name too long
  for the filesystem is cut so that `<id>-<name>` stays within 200 bytes,
  keeping its extension. Each file goes through a temp file and a rename, and an
  existing one is overwritten. Downloaded lines end with `→ <absolute path>`; in
  `--json` each downloaded object gains an absolute `path`, Absent otherwise.
  `filename` stays Jira's own.
- `ergon get` now prints the issue's Description, as markdown below the fields,
  and names a Degraded body with a `degraded:` field. It was only readable
  through `--json` before.
- Added `deno task check` (format check, lint, type check, tests) and a
  pre-commit hook in `.githooks/` that runs it.
- **Breaking**: `--sprint current` is now `--sprint active`, on `ergon new` and
  `ergon edit`, and `current` errors naming it. The keyword asks for the sprint
  Jira marks active — which runs past its end date until someone completes it —
  and the name now says so.
- `--sprint active` no longer needs a `sprintBoardId` when a project has several
  boards: it asks each scrum board, uses the active sprint they share, and
  refuses, listing them, only when they disagree. PGR resolves without
  configuration.
- Added `ergon ls --order board`, the order the board shows: the active sprint,
  then each upcoming sprint in the board's sequence, then the backlog, in drag
  order within each. It lists the board's own issues, across every project on
  it, and works without `--project` when every configured project names the same
  `sprintBoardId`
  ([ADR 0013](./docs/adr/0013-board-order-belongs-to-the-board.md)).
- **Breaking**: removed `ergon ls --order rank`, which now errors naming
  `board`. Raw Rank interleaved the backlog with the sprint and led with tickets
  closed years ago.
- Fixed `ergon ls` telling finished work apart by resolution, which this Jira
  never sets: `--sprint` no longer carries a `resolution = Unresolved` clause
  that excluded nothing, and an otherwise unfiltered `ls --all` now lists issues
  not in the Done status category instead of every issue ever created.

- Added `ergon new --description-file <PATH>`, which reads the issue description
  from a file, and from stdin when the path is `-`. `--description -` now reads
  stdin on `ergon new` and `ergon log` as it already did on `ergon edit` and
  `ergon comment`. **Breaking**: `ergon new --description -` previously created
  an issue whose description was the literal text `-`.
- `--description-file` is on `ergon new` alone, because it is the only command
  that prompts and so the only one where stdin is contended; elsewhere
  `--description - < file` already reads a file
  ([ADR 0012](./docs/adr/0012-a-file-flag-only-where-stdin-is-contended.md)).
  Reading stdin on a run that may still prompt is refused rather than left to
  hang, passing both description flags is refused rather than resolved by
  precedence, and an empty file or empty pipe is refused rather than creating an
  issue with no description.
- A description read from a file is read, and its markdown checked, before the
  first prompt and the first Jira call, and a refusal names the file to rewrite.
- Fixed `--description "  "` sending an empty rich-text document to Jira on
  `ergon new` and `ergon log`, where `--description ""` was correctly skipped.
- Added `ergon unlog <ISSUE> <WORKLOG_ID>`, which removes a worklog and prints
  what it removed so the entry can be logged again. A worklog is removed and
  re-logged rather than edited in place
  ([ADR 0011](./docs/adr/0011-a-worklog-is-removed-and-re-logged.md)); a worklog
  logged by anyone else is refused.
- Added the worklog's Jira id to `ergon worklogs`, as a new second column and a
  new `id` field on `ergon worklogs --json`. The field is additive, but the
  human output is a column wider.
- Added `descriptionDegraded` to `ergon worklogs --json`, and the matching
  `(degraded: panel)` suffix to the human listing and to `ergon unlog`'s output.
  A worklog comment that loses structure on the way out now says so, as a
  description and a comment body already did.
- Changed `ergon log` to stop notifying the issue's watchers. Both writing and
  removing a worklog now pass `notifyUsers=false`.
- `ergon unlog` passes `adjustEstimate=leave`, so removing a worklog does not
  touch the issue's remaining estimate. Jira's default would add the removed
  time back, which is not the inverse of logging it: logging only subtracts down
  to zero, so on an issue carrying no estimate a remove-and-re-log would invent
  a remaining estimate out of the hours it had just removed.

- Changed rich-text fields to markdown in both directions: a description, a
  comment body and a worklog comment are parsed as markdown on the way in and
  read out as markdown a parser can take back. Headings, lists, checklists,
  quotes, rules, code blocks, tables, links and the bold/italic/code/strike
  marks all survive a round trip. Markdown ergon cannot express is refused by
  name rather than dropped. **Breaking**: `ergon get --json`,
  `ergon comments --json` and `ergon worklogs` separate blocks with a blank
  line, tables read out as real tables, and `table` no longer appears in
  `descriptionDegraded`/`bodyDegraded` while `mention`, `emoji` and `inlineCard`
  now do. See
  [ADR 0010](./docs/adr/0010-markdown-is-ergons-rich-text-format.md).
- Changed the rewrite guard to the round trip itself, so `ergon edit` and
  `ergon comment --id` now open a description or comment holding lists,
  headings, code or tables, and still refuse one holding a panel, a mention, or
  a table with merged cells.
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
