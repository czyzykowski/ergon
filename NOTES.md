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
- [x] Markdown as ergon's rich-text format, both directions
      (`toAdf`/`renderAdf`)
- [x] Removing a worklog (`ergon unlog`)
- [x] Rich text from a file or a pipe (`ergon new --description-file`)
- [x] Board order (`ergon ls --order board`), replacing `--order rank`
- [x] `--sprint active`, resolved across a project's boards, replacing
      `--sprint current`
- [x] Reading an issue's description in plain `ergon get`
- [x] Listing an issue's Attachments (`ergon attachments`)
- [x] Selecting Attachments by id (`ergon attachments KEY ID...`)
- [x] Downloading Attachments (`ergon attachments ... --download <dir>`)
- [x] Listing a project's Open Sprints (`ergon sprints`)
- [x] Time in status (`statusSince` on `ergon get`)
- [x] Listing an issue's Children (`children` on `ergon get`)
- [x] Plain help and one-line usage errors, for captured output
- [x] Assigning an issue to the operator (`--assignee me|none` on `new`, `edit`)
- [x] Naming an issue's Reporter (`reporter` on `ergon get`)
- [x] Searching issues as data (`ergon search --json`)
- [ ] `--sprint <name>` matching future Sprints, on `edit` and on `new` in both
      modes, through `listOpenSprints`
- [ ] A command that takes up an issue in one step — assign it to the operator,
      move it to In Progress, start the timer. It needs its own verb: `start`
      already means the timer.
- [ ] `--assignee <person>`: a user search through
      `/rest/api/3/user/assignable/search`, refusing a name that fits several
      people (`matt` fits two on PCK).

## Updates

- Jira's `/rest/api/3/search/jql` answers an unknown project key or status name
  with `{"issues":[],"isLast":true}`: no error, no warning. `search --project`
  now refuses an undeclared project, as `ls --project` does, so a typo cannot
  read as "nothing matched". `--status` is still unchecked and fails the same
  way — a misspelt status reads as no issues. Checking it needs Jira's status
  list (`/rest/api/3/status`), one more request per search or a new Cache entry,
  which was more than adding `search --json` warranted. A known gap, not an
  oversight.

- Jira answers `POST /rest/api/3/issue` with `{id, key, self}` and no fields.
  `createIssue` used to map that through `mapIssue`, whose `fields ?? {}` guard
  (added when the missing fields crashed it) read every field as empty, so
  `ergon new` printed `Created PGR-2009:` with no summary, in both modes. It now
  returns only `{id, key}`, and `new` prints the summary it sent. The
  `assignee_test` stub had returned fields, which is why no test caught it.

- `reporter` on `ergon get` comes from the issue read that already fetches every
  field, so it costs no request. Over the last 1,000 PCK issues the Reporter was
  always set and always named, and differed from the Creator on 23: one person
  filing for another (Adriana Malkanova filing PCK-811 with Andrew Grosso as
  Reporter). So the Reporter is who asks, and the Creator only who typed it in.
  `creator` is left out: free to fetch, but nothing asks who typed an issue in,
  and on an issue filed through ergon both name the operator anyway. `ls` does
  not ask for `reporter`, so it is Absent there, like `links`.
- **Follow-up:** a hidden Assignee reads as `null` ("Unassigned"), because
  `mapIssue` folds a nameless user object into null. ADR 0006 says it should be
  Absent, as the Reporter and a comment's `author` are. Fixing it changes the
  type of `assignee`, which Children and `ls --json` share, so it was left out
  of the Reporter change.

- `--assignee` is `me` or `none` only; see `specs/assign-issue.md`. PCK and PGR
  both default new issues to unassigned (`assigneeType: UNASSIGNED`), and the
  Assignee is on the create and edit screens of every issue type there, so it
  travels in the same request as the other fields. `me` is asked of
  `/rest/api/3/myself` per run. Checked live with `ergon edit PGR-1975` both
  ways. `ergon new --assignee` was not run live, since that creates an issue:
  the payload is covered by tests, but Jira accepting `assignee: null` on create
  is unconfirmed.

- Help and usage errors are set on the root command and inherited:
  `.help({ colors: false })` and `.throwErrors()`. Without `throwErrors`,
  cliffy's `throw()` prints the full help to stdout with `console.log` before
  the error line; with it, a `ValidationError` reaches `main`'s catch like any
  other error. cliffy's `--version` colours unconditionally, so `versionOption`
  replaces it with a plain one that keeps the `-V` short / `--version` long
  split. `tests/main_test.ts` spawns `src/main.ts` to check the streams, hence
  `--allow-run` on the test tasks. **Follow-up:** bare `ergon`, with no command,
  prints nothing and exits 0, because the root command has no action.

- `children` on `ergon get` is one `parent = KEY ORDER BY key ASC` search, paged
  to completion through `searchAll` and run in parallel with the issue and
  changelog reads. Direct Children only: walking an Epic's whole tree is
  repeated `get` calls, and a Descendant term waits until something needs it. A
  Child is the Parent slot read backwards, never Jira's Parent-Child Link type.
  Checked live on PCK-1243 (19 Children, one Done).

- `statusSince` reads `POST /rest/api/3/changelog/bulkfetch` with
  `fieldIds: ["status"]`, paged by `nextPageToken`. Its `created` is epoch
  milliseconds, not the offset-bearing string the rest of the API sends, which
  is why `statusSince` is UTC ISO (`…Z`) and why the `created` fallback is
  re-spelled to match. Checked live against a full walk of
  `/issue/{key}/changelog` on ten issues, among them TCCC-1 (1218 entries) and
  PGR-643 (3588, never transitioned): every instant matched to the millisecond.
  The issue and changelog requests run in parallel. A same-name remap is not a
  Transition (`fromString === toString`); see the glossary.
- The standup skill's In Progress rule should read "`statusSince` 7+ days and no
  comment, commit or PR in that window": `statusSince` measures time in status,
  not activity.

- `ergon sprints` ignores `sprintBoardId` on purpose, unlike `--sprint active`:
  it reports what exists, and a numeric `--sprint` writes regardless of board
  config. Against PCK it lists seven Open Sprints over boards 439, 373 and 26,
  parking-place Sprints included; their future sequence follows board 439
  because Jira lists that board first. Jira caps Sprint names at 30 characters
  (`Estimated but not yet in a Spr` is stored that way).
- Found while designing it: `--sprint <name>` only ever matches active Sprints,
  and `ergon new` refuses names when Non-interactive, so an upcoming Sprint is
  writable only by id. Left for a follow-up (see Progress).

- Attachment content redirects off Jira, checked on PGR-1864 (44624, a 586 KB
  PNG). `GET /rest/api/3/attachment/content/{id}` with Basic auth answers `303`
  to `https://api.media.atlassian.com/file/<uuid>/binary`, whose query carries
  its own `token` and `client` (plus `dl` and `name`). That URL answers
  `200 image/png` with the full body and no `Authorization` at all, so fetch
  dropping the header on the cross-origin hop is harmless and the default
  `redirect: "follow"` is all the client needs. `requestBytes` shares `send`
  with `request` (auth, error unwrapping) and, unlike it, sends no
  `Accept: application/json`.
- The download temp file is `<final path>.<ms>.tmp`, as `saveState` does, not
  `Deno.makeTempFile`: that creates the file `0600`, and the mode survives the
  rename, so every download came out owner-only.
- `downloadAttachment` buffers the whole file in memory before writing. Fine for
  screenshots and logs (a 47 MB JPEG on HAYU-364 took 5 s); the largest
  Attachment seen, 804 MB on GAME-626, was not downloaded. Streaming to the temp
  file is the fix if that ever matters.
- Hand-checked: all four PNGs on PGR-1864 into a missing nested dir; a re-run of
  one id over an existing file; an unknown id refusing before the dir is
  created; RDMP2021-3944's two `image.png` (44626, 44627) landing side by side.
- `ergon attachments` reads the issue's `attachment` field rather than a
  separate endpoint, so one request returns every Attachment, Comment
  attachments included, in Jira's order. `mapAttachment` drops Jira's `content`
  and `thumbnail` URLs (both need ergon's credentials) and leaves `author`
  Absent when hidden, as `mapComment` now does too (it used to map a hidden
  author to an empty string). Size is rendered with the unit chosen after
  rounding, so a file just under a megabyte reads `1 MB`, never `1024 KB`. The
  timestamp slice is shared with `ergon comments` (`timestamp`, in
  `src/timestamp.ts`).
- Plain `ergon get` prints the Description whole, last, unindented and
  unlabelled, rather than a length with a pointer to `--json`: plain output is
  for people, and the body is the part of an issue they read. It is the raw
  markdown `--json` carries, not terminal-rendered, so the two never disagree.
  Unlike `ergon comments`, which indents each body to separate one from the
  next, a single body has nothing to be told apart from, and indenting it would
  corrupt its code blocks and nested lists when copied out. A Degraded body is
  named in a `degraded:` header field, ahead of the text it qualifies.
- `--sprint current` became `--sprint active` after writes failed on a closed
  sprint. ergon's own lookup was already live; the closed id came from a copy
  the `jira` skill kept for PGR, which had several boards and no
  `sprintBoardId`. The fix removes the reason for the copy: every scrum board of
  the project is asked, and boards sharing a sprint (26, 373 and 439 all show
  the PCK/PGR sprint) give one answer. Kanban boards are skipped by `type`,
  because Jira answers a sprint request on one with an error.
- The Monday gap is deliberately left alone. Board 26's sprint ends Monday 04:00
  UTC but is completed around 20:48 UTC, so Jira's active sprint is last week's
  for a whole European working day. A calendar rule ("the sprint whose dates
  cover now") was considered and dropped: during the gap last week's sprint is
  still open, a write to it succeeds, and completing it carries unfinished
  issues into the new one. Only a closed sprint fails, and nothing ergon reads
  live can name one.
- `ergon new --sprint active` reads the project's boards from Jira, not the
  board cache: the cache holds no board type. The interactive board prompt and
  `--sprint <name>` still use the cache.
- Board order replaces raw Rank (ADR 0013, superseding 0009). Facts found on the
  way: PGR has no board of its own and lives on the Unified Client Board (26)
  with PCK and ~15 other projects; PCK's own board (373) shows only sprints
  board 26 owns; Rank is one global field (customfield_10011). The workflows
  never set a resolution, so `resolution = Unresolved` matches every issue — use
  `statusCategory != Done`. A board is read through its saved filter
  (`filter = <id>` in JQL), which keeps the v3 search and its ADF mapping. Board
  439 ("by Estimate") is not ranked and is refused.
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
- `deno lint` is clean repo-wide. It used to fail `no-import-prefix` on the
  inline `https://` std import that every one of the fifteen `tests/*_test.ts`
  files carried. `deno.json` now maps `testing/` to
  `https://deno.land/std@0.224.0/testing/` — the same shape as the `path/` and
  `yaml/` entries beside it — and the tests import `testing/asserts.ts`. The std
  version is unchanged, so nothing resolves differently and `deno.lock` did not
  move.
- `deno fmt --check` still reports seven files: `specs/ergon-status-tmux.md`,
  `specs/move-issue-status.md`, `specs/open-issue-in-browser.md` and four
  untracked files under `.scratch/`. All predate the lint fix and none is
  reachable from `src/`; formatting them would rewrap three historical specs for
  no reading benefit. `deno fmt` alone clears them whenever that is wanted.
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
- `renderAdf` and `toAdf` are deliberate inverses over the Expressible set, and
  `fromAdf`/`unsupportedAdfNodes` are gone — they existed only because the two
  directions disagreed. See
  [ADR 0010](./docs/adr/0010-markdown-is-ergons-rich-text-format.md).
- `renderAdf` joins blocks with a blank line. The single newline ADR 0004 chose
  was fine as decoration and lossy the moment anything parsed the output: under
  CommonMark two paragraphs one newline apart are one paragraph.
- Unknown ADF node types are not skipped. `renderAdf` names the type in
  `degraded` and recurses into its content anyway, deciding inline vs block by
  whether any child is an inline type. A future Jira node keeps its text.
- `descriptionDegraded` is now the Expressible set stated from the read side: an
  empty one means the body can be written back. That is the point of defining
  one set rather than two.
- The Replacement guard is the round trip itself, not a table of node types. A
  table with merged cells holds only Expressible node types, so a type check
  would wave it through and lose `colspan` with no undo.
- Sameness is directional containment — the original may carry nothing `toAdf`
  would have produced — with two normalisations that are not attributes
  (adjacent text runs coalesce, mark arrays compare unordered) and one strip by
  provenance (`localId`, which Jira mints).
- Adjacent lists alternate their marker — `-` then `*`, `1.` then `1)` — because
  two lists written one after the other under the same marker are one list when
  read back. That is what lets a checklist sit next to a bullet list.
- Markdown cannot express two emphasised runs written side by side, nor an
  emphasised run whose first or last character is punctuation sitting against a
  letter: the delimiters stop flanking. Those documents read fine and the guard
  refuses to rewrite them, which is the safe direction.
- An empty paragraph is dropped on both sides rather than refused. Markdown has
  no way to spell one — blank lines are separators — and the Jira UI produces
  them constantly, so refusing would put most hand-written Descriptions out of
  reach.
- `toAdf` mints `localId` for a task list and its items. Jira mints its own, but
  its validator wants one present, and the guard strips them either way.
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
  written for the first. That still holds under
  [ADR 0010](./docs/adr/0010-markdown-is-ergons-rich-text-format.md), which
  replaced those decisions without changing which fields they cover.
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
  rule now lives in `GLOSSARY.md`'s **Cache** entry.
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
- `Worklog` gains `id`, which Jira has always returned on every worklog entry
  and `assembleDay` used to discard. Without it nothing ergon printed could name
  an entry, so no removal could be scripted.
- `JiraWorklogEntry.id` and `.started` are required rather than optional, unlike
  the rest of that interface. Jira always sends both, and coalescing them to
  `""` produced an id `ergon unlog` can never match and a receipt reading `at`
  with no time — the failure `getMyAccountId` already refuses to have.
- `requireRemovableWorklog` in `src/worklogs.ts` is the gate on a Removal, pure
  so that both refusals — id not on the issue, author not you — are provable
  without a client, and throwing rather than returning a result union, per
  AGENTS.md's "prefer `throws`" and the `assertRewritable`/
  `requireSprintFieldId` gates. `tests/worklogs_test.ts` asserts no `DELETE` is
  issued when it refuses, which is the test that matters: a refusal that still
  removes is the only unrecoverable bug here.
- The receipt carries `YYYY-MM-DD HH:MM`, not just the time, because `ergon log`
  defaults `--date` to today: a time alone cannot re-log a correction made to
  any other day. `startStamp` sits beside `startTime` in `src/worklogs.ts`.
- `worklogPath` in `src/api/jira.ts` builds both worklog write paths, so the
  query parameters are stated once. Both pass `notifyUsers=false`; only the
  removal passes `adjustEstimate=leave`, which is not Jira's default — see
  `docs/adr/0011-a-worklog-is-removed-and-re-logged.md` and the measurement
  below.
- `ergon log` no longer notifies watchers either. Both worklog writes are
  ergon's own bookkeeping.
- `startTime` moved from `src/commands/worklogs.ts` into `src/worklogs.ts`,
  since `ergon worklogs` and `ergon unlog` now both read a Worklog's start the
  same way. `ergon comments` keeps its own `timestamp`, which is a different
  format.
- Measured against the live instance on 2026-10-01, using a throwaway worklog on
  PGR-1882. **Jira does not verify the issue key in a worklog delete.**
  `DELETE /issue/PGR-1916/worklog/83101` removed worklog 83101, which lived on
  PGR-1882. So the issue key in `ergon unlog`'s arguments buys no safety from
  Jira, and `requireRemovableWorklog` is the whole of the protection rather than
  a better error message. The gate was then checked live: removing a PGR-1882
  worklog id via PGR-1916 was refused with `No worklog 83103 on
  PGR-1916.` and
  nothing was sent.
- Measured at the same time. **Jira's `adjustEstimate` defaults do not cancel
  across remove-then-re-log.** Logging 1m on PGR-1882, which carried no
  estimate, moved its remaining estimate from absent to 0; removing that worklog
  moved it to 60s. The create default subtracts with a floor at zero, the delete
  default adds with no ceiling, so they are inverse only where the remaining
  estimate already covers the time removed. None of the fifteen most recent
  issues this operator has logged against carries an estimate, so the default
  would have invented one on every correction. `unlog` therefore sends
  `adjustEstimate=leave`, verified to hold the estimate at 0 across a
  log-then-remove cycle.

- `Worklog` carries `descriptionDegraded`, matching `descriptionDegraded` on an
  issue and `bodyDegraded` on a Comment. Dropping it would have made a worklog
  comment the one place content degrades silently, which **Degraded** forbids —
  and ADR 0011 makes it load-bearing, since the receipt is what a re-log is
  typed from, so a panel that quietly became a quote would be re-logged as a
  quote.
- `blockFrom` in `src/adf.ts` lost an unused `parent` parameter it never read.
  `blocksFrom` still needs its own, for the container rule and the refusal text.

- Measured on 2026-10-02, and the fact the whole of
  `specs/rich-text-from-a-source.md` turns on. **A cliffy prompt against a piped
  stdin hangs rather than failing.** `Input.prompt` with stdin at EOF from
  `echo "" |` did not throw and did not return; it sat there until the command
  was killed at two minutes. So reading a Source from stdin on a run that may
  still prompt cannot be left to fail on its own — it produces no output at all
  — which is why `planSource` refuses the combination up front.
- `Deno.stdin.isTerminal()` is available on Deno 2.6.4 and reports `false` for a
  pipe, so the condition is cheaply detectable. **Done** for `ergon new` by
  detection rather than per prompt site: `isInteractive` in `src/interactive.ts`
  makes any run without a terminal on both ends Non-interactive (ADR 0014), so
  the hang becomes "Project key is required; pass --project." or "Summary is
  required; pass --summary.". The original follow-up read: wrapping
  `ergon new`'s seven prompt sites in that check would turn every variant of the
  hang into a named error ("needs a Client SOW but stdin is not a terminal; pass
  --client-sow or --non-interactive"), including the ones that predate this work
  — any non-tty `ergon new` that needs a prompt hangs today. It was left out
  because it rewrites prompting for runs that have nothing to do with sourcing a
  description, and it subsumes `planSource`'s narrower refusal when it lands.
- Open question, found while making detected runs Non-interactive: `ergon new`
  reads `state.lastProject` in every mode and writes `lastProject` and
  `lastEpic` in every mode, so a Non-interactive run still depends on, and
  feeds, the last project and epic someone chose. Only `lastClientSow` (and the
  `lastEpic` read) follow ADR 0001. Left as it was, since flagged runs already
  behaved so; with detection it now reaches every scripted and agent run.
- `ergon move` and `ergon menu` read the same `isInteractive` decision: `move`
  without `--to` refuses before `getTransitions`, `menu` refuses outright. The
  subprocess test that an unknown `--to` still lists the transitions needs a
  Jira that answers, so it serves one with `Deno.serve` on loopback and the
  `test` and `coverage` tasks gained `--allow-net=127.0.0.1` — loopback only, so
  no test can reach a real Jira.
- `toAdf` already normalises trailing newlines: `"a\n\n- b"`, `"a\n\n- b\n"` and
  `"a\n\n- b\n\n"` all produce the same two blocks. A file Source therefore
  needs no trimming, which is what made the file path a smaller change than
  expected.
- `toAdf("")` and `toAdf("\n  \n")` both produce a zero-block document, not
  `null`. `createIssue` and `worklogBody` guard with `if (input.description)`,
  so `--description ""` was skipped while `--description "  "` sent that empty
  document to Jira. Both commands now normalise blank inline text to no
  description at all.
- `UnexpressibleError` gained `readonly reason`, so a refusal can be rebuilt
  with a remedy that names the file the markdown came from. The `remedy`
  constructor parameter had been there since ADR 0010 with only its default ever
  used; `reason` is what was missing to vary it.
- `src/text_source.ts` is the one place that decides where rich text comes from.
  `planSource` is pure and tested directly, like `planEdit` and
  `requireSprintFieldId`; `readSource` takes its stdin reader as an argument so
  a pipe can be faked in a test, since `Deno.stdin` cannot be.
