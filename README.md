# ergon

CLI for Jira + Clockwork workflows.

## Setup

- Install Deno.
- `deno task ergon --help`

## Usage

- `ergon --help`
- When prompted for Epic, choose `None` to skip.
- Client SOW prompt defaults to last selected value.
- Labels prompt uses Jira labels with search and checkboxes.
- Epic prompt supports search input.
- Use `--no-cache` to force fresh Jira metadata.

### Discovering field values

Before scripting `ergon new`, list what Jira will accept:

```
ergon labels [--filter <substring>] [--json]
ergon client-sows <PROJECT> [--json]
ergon sprints <PROJECT> [--json]
```

All three always query Jira rather than the metadata cache, so they report what
is valid now. `--json` gives labels as `["a", "b"]` and Client SOWs as
`[{"id": "...", "value": "..."}]`; `ergon new --client-sow` accepts either the
id or the value.

`ergon sprints` lists the project's open sprints — the active one first, then
the upcoming ones in board order — each once, with the boards that show it:

```
ID    STATE   NAME          START       END         BOARDS
1329  active  Oct 12 - 16   2026-10-12  2026-10-19  PCK Sprint Board (373), Unified Client Board (26)
1330  future  Oct 19 - 23   2026-10-19  2026-10-26  Unified Client Board (26)
```

`--json` gives
`[{"id", "name", "state", "startDate", "endDate", "boards":
[{"id", "name"}]}]`,
with dates as Jira's ISO instants or `null`. `--sprint` accepts any of these
ids; a name is matched among active sprints only, so an upcoming sprint is
written by its id.

### Scripted creation

Run without a terminal on both stdin and stdout — piped, captured with
`KEY=$(ergon new …)`, or started by a script or agent — `ergon new` is
Non-interactive on its own: it never prompts, and inherits Client SOW and labels
from the parent issue. At a terminal, `--non-interactive` does the same, for a
shell loop that should never stop at a prompt:

```
ergon new "Fix login" --non-interactive --parent PCK-12
```

- Where a Non-interactive run lacks a value it cannot do without, it fails at
  once naming the flag: `--project` when neither the flag, the last project nor
  config names one, `--summary` when no summary was given.

- The parent is `--parent`, or the epic when `--parent` is omitted.
- Anything passed explicitly wins; `--labels` replaces the inherited set rather
  than adding to it.
- Where the parent has nothing, project config defaults apply.
- The remembered Client SOW is ignored, so the same command always produces the
  same issue.
- Use `none` to clear a field: `--labels none`, `--client-sow none`,
  `--epic none`, `--sprint none`.

Interactive runs are unaffected: the parent still pre-selects the Client SOW
prompt, and the label prompt still appears when nothing supplied labels.

### A description from a file or a pipe

A description worth writing in markdown is one too long to quote into a shell,
so `--description` can also name where the text is:

```
ergon new "Fix login" --non-interactive --parent PCK-12 \
  --description-file spec.md
ergon new "Fix login" --non-interactive --parent PCK-12 \
  --description-file - <<'EOF'
## Acceptance criteria

- [ ] The redirect preserves the query string
EOF
ergon log PCK-12 2h --description - < note.md
```

- `--description-file <path>` reads the description from that file, and `-` as
  the path means stdin. `--description -` means stdin too, as it already does on
  `ergon edit` and `ergon comment`.
- `--description-file` exists on `ergon new` alone, because `ergon new` is the
  only command that prompts and so the only one where stdin is contended.
  Elsewhere `--description - < spec.md` already reads a file
  ([ADR 0012](./docs/adr/0012-a-file-flag-only-where-stdin-is-contended.md)).
- A piped stdin makes the run Non-interactive, so `--description - < spec.md`
  needs no other flag. Typing the description into stdin at a terminal is
  refused, because `ergon new` would consume stdin and then hang waiting for an
  answer to the epic prompt. Pass `--non-interactive`, or use
  `--description-file <path>`, which leaves stdin alone and still prompts.
- Passing both `--description` and `--description-file` is refused rather than
  resolved by precedence.
- An empty file, a whitespace-only file and an empty pipe are refused: naming a
  file asserts there is text in it, and a generator that produced nothing should
  not create an issue someone has to clean up. `--description ""` still means no
  description, as it always has.
- The file is read, and its markdown checked, before the first prompt and the
  first Jira call — so a mistyped path or an image ergon cannot write costs an
  error rather than six answered prompts. A refusal from a file names the file:
  `Rewrite spec.md without it.`
- `none` is not a sentinel here. `--description-file none` reads a file called
  `none`; omit the flag to create an issue with no description.

### Reading an issue

`ergon get <KEY> --json` returns an issue as a machine-readable object, and is
the intended way for an agent to find out what an issue asks for:

```json
{
  "key": "PCK-12",
  "summary": "Fix login redirect",
  "description": "- reproduce on staging\n- check the 302 target",
  "descriptionDegraded": [],
  "status": "In Progress",
  "statusCategory": "indeterminate",
  "reporter": "Ada Lovelace",
  "labels": ["backend"],
  "created": "2026-08-01T09:12:00.000+0100",
  "updated": "2026-08-14T11:04:31.000+0100",
  "statusSince": "2026-08-09T15:40:12.000Z",
  "priority": "Medium",
  "dueDate": "2026-08-20",
  "sprints": [{ "name": "Aug 17 - 21", "state": "active" }],
  "clientSow": "Peacock: Marketing",
  "links": [
    {
      "id": "33550",
      "phrase": "is blocked by",
      "key": "PCK-9",
      "summary": "Pin the runner image",
      "status": "Done"
    }
  ],
  "children": [
    {
      "key": "PCK-14",
      "summary": "Handle the 302 target",
      "issueType": "Task",
      "status": "Ready for QA",
      "statusCategory": "indeterminate",
      "assignee": null
    }
  ]
}
```

- `description` is the issue body as markdown, or `null` when there is none.
  Headings, lists, checklists, quotes, rules, code blocks, tables, links and the
  bold/italic/code/strikethrough marks all survive, and can be written straight
  back with `ergon edit --description`.
- `descriptionDegraded` names constructs whose shape markdown could not carry —
  `["panel"]` means the text is all there and the panel is not. It is `[]` when
  the body rendered cleanly, which is also when the body can be written back.
  Text is never dropped without being reported here
  ([ADR 0010](./docs/adr/0010-markdown-is-ergons-rich-text-format.md)).
- `statusCategory` is the stable key (`new`, `indeterminate`, `done`), so it can
  be tested against without knowing a project's status names.
- `reporter` is the display name of the person Jira records as asking for the
  issue — whoever filed it, unless they named someone else. An issue filed
  through ergon names the account ergon runs as, whoever the request came from.
  It is `null` when Jira reports no Reporter, and missing when Jira hides the
  name, as a comment's `author` is. Missing from `ls` and `search` too.
- `created` and `updated` are Jira's own timestamps, passed through unparsed.
- `statusSince` is when the issue entered the status it shows, as a UTC ISO
  instant: its last Transition — any change of status name, one within a
  category included — or `created` if it has never had one. Unlike `updated`, a
  comment or an edit does not reset it. It is missing from `ls`, and from `get`
  when the changelog could not be read (a warning on stderr says so).
- `priority` is the Jira Priority name, or `null`. It is reported but never
  ordered by: the ordering the board carries is `--order board`.
- `dueDate` is Jira's due date as `YYYY-MM-DD`, or `null`.
- `sprints` is the issue's whole sprint history in the board's own order, not
  chronology — a ticket carried over twice reports three, and one planned ahead
  reports a sprint it is not yet working in. `[]` means no sprint.
- `clientSow` is the Client SOW's display value, or `null`.
- `links` holds every link Jira reports, each `phrase` reading from the issue
  you asked about — `"is blocked by"` on one issue is `"blocks"` on the other.
  Links only come back from `ergon get`; `ls` and `search` leave them out.
- `children` lists every issue whose Parent is this one, by key: direct Children
  only, Done ones included, never capped — so counting `statusCategory: "done"`
  says how far along the issue is. `[]` means it has none. Jira's Parent-Child
  link type is not a Child; it shows under `links`. Like `links`, `children` is
  missing from `ls` and `search`, and from `get` when the Children could not be
  searched (a warning on stderr says so).
- A field ergon did not fetch is **missing** rather than `null`: `links` has no
  key at all on an issue that came from `ls`, and `sprints`/`clientSow` have
  none for a project config has never heard of. `null` always means ergon looked
  and Jira had nothing
  ([ADR 0006](./docs/adr/0006-absent-means-not-fetched.md)).

The human-readable `ergon get` output lists the fields, links and Children, then
prints the body below a blank line — the same markdown as `description`,
unindented so it copies out intact. An issue with no body ends at its fields,
and a `degraded:` line names what `descriptionDegraded` would. `reporter:` reads
`(nobody)` when Jira reports none and `(hidden)` when it hides the name:

```
PCK-12 [In Progress] Fix login redirect
  type:     Task
  project:  PCK
  reporter: Ada Lovelace
  assignee: Lukasz Czyzykowski
  since:    2026-08-09
  links:
    is blocked by PCK-9 [Done] Pin the runner image
    relates to PCK-31 [To Do] Audit CI secrets

- reproduce on staging
- check the 302 target
```

### Listing issues

```
ergon ls --json                            # the same issue shape, as an array
ergon ls --order board --sprint            # the active sprint, as the board shows it
ergon ls --sprint --json
ergon ls --since 2026-09-17 --json         # only what has moved since
```

- `--json` emits an array of the object `ergon get --json` returns, so one
  parser handles both, and one request replaces one `get` per key. An empty
  result is `[]`; without `--json` it stays `No issues found.`
- `--order` takes `board` or `updated`, and defaults to `updated`. `board` is
  the order the board shows: the active sprint, then each upcoming sprint in the
  board's sequence, then the backlog, in drag order within each. It lists what
  is on the board — its own filter, so another project's issue on the same board
  takes its place — narrowed by the other flags. Done issues stay in open
  sprints and are dropped from the backlog, as on the board. The board is the
  project's `sprintBoardId`; without `--project` every configured project must
  name the same one, since an order across boards is one nobody chose
  ([ADR 0013](./docs/adr/0013-board-order-belongs-to-the-board.md)). `--limit`
  cuts the ordered list. `--order rank` is gone and errors naming `board`.
- `--sprint` keeps every status in the open sprint and does not change the
  ordering. Finished work is told apart by status category, never resolution,
  which this Jira's workflows do not set.
- `--since` takes a date, not an instant, and bounds the list to issues updated
  on or after it.
- Naming a project asserts ergon is configured for it, so `--project` on an
  undeclared project is an error. A cross-project sweep that happens to return
  an issue from an unknown project still returns it, with `sprints` and
  `clientSow` missing.

### Searching issues

```
ergon search "login redirect"                  # any project, most recently updated first
ergon search "login redirect" --project PCK --json
ergon search sso --status "In Progress,Blocked"
```

- Matches the text anywhere in an issue (JQL `text ~`), in everyone's issues,
  not only yours.
- `--json` emits the same array `ergon ls --json` does. An empty result is `[]`;
  without `--json` it stays `No issues found.`
- `--project` on an undeclared project is an error, as on `ls`: Jira answers an
  unknown key with no issues rather than an error, so a typo would read as
  nothing found. `--status` is not checked, so a misspelt status finds nothing.

### Reading a day's time

```
ergon worklogs                     # today, by issue
ergon worklogs --date 2026-09-17
ergon worklogs --json
```

```
PCK-12  45188  09:14  1h      Paired on the redirect bug
PCK-12  45231  11:02  45m     Reviewed the fix
PGR-4   45302  14:30  2h 15m  Sprint planning

Total: 4h
```

- One line per worklog, not per issue: two blocks on the same ticket at
  different times of day are two facts.
- The second column is the worklog's Jira id, which is what `ergon unlog` takes.
  Key then id is the order it is typed in.
- `--json` gives
  `[{"id", "issueKey", "started", "timeSpentSeconds", "description",
  "descriptionDegraded"}]`,
  ordered earliest first. `started` is Jira's own timestamp, passed through
  unparsed, and `description` is `null` when the worklog carries no comment.
- `descriptionDegraded` names what a worklog comment lost on the way out — a
  panel that reads as a quote, an attachment that reads as its filename — and is
  empty when it lost nothing. The human listing appends the same thing as
  `(degraded: panel)`, because degrading is never silent.
- Only your own worklogs on the day asked for are listed.
- ergon writes time through Clockwork and reads it back from Jira. Jira sees
  every worklog — the Clockwork timer, `ergon log`, and anything typed into the
  Jira UI — so it is the only place a day is whole
  ([ADR 0008](./docs/adr/0008-jira-is-the-record-of-logged-time.md)).
- `ergon status` gets today's total from the same reading, so the two cannot
  disagree. It keeps its own subject — the running timer — and takes no
  `--date`, because a timer only means anything now.

### Removing a worklog

```
ergon unlog PCK-12 45188
```

```
Removed 1h on PCK-12 at 2026-09-17 09:14 (45188): Paired on the redirect bug
```

- Both the issue key and the worklog id are required, and the id is the one
  `ergon worklogs` prints. Unlike `ergon edit` or `ergon comment`, the key does
  not fall back to the last issue worked on: here it is half of Jira's address
  for the worklog rather than the subject of the command, and a stale fallback
  would report "no such worklog" for an id that exists.
- There is no confirmation prompt. The id is the deliberate act — it is read off
  a listing, not typed from memory — and an id naming no worklog on that issue
  is refused before anything is removed. That refusal is the whole of the
  protection, not a nicer error: Jira does not check the issue key in a worklog
  delete, so addressing one issue's worklog id to another issue removes it
  anyway. ergon resolves the id against the issue's own worklogs first, and
  never sends a `DELETE` it has not already found.
- The receipt is the only record of what went: Jira cannot restore a worklog, so
  the line is what a re-log is typed from. It carries the date as well as the
  time, because `ergon log` defaults `--date` to today.
- Only your own worklogs can be removed. A colleague's is refused by naming
  them, with no flag to override, so `ergon unlog` cannot reach a worklog that
  `ergon worklogs` is unable to show you.
- A worklog cannot be edited, only removed and logged again
  ([ADR 0011](./docs/adr/0011-a-worklog-is-removed-and-re-logged.md)).
- Removing sends `adjustEstimate=leave`, so it does not touch the issue's
  remaining estimate. Jira's default would add the removed time back, which
  sounds like the inverse of logging but is not: logging only subtracts down to
  zero, so on an issue carrying no estimate a remove-then-re-log invents a
  remaining estimate out of the hours it just removed.
- Neither `ergon log` nor `ergon unlog` notifies the issue's watchers.

### Linking issues

```
ergon blocked-by PCK-9           # the last issue is blocked by PCK-9
ergon blocked-by PCK-12 PCK-9    # PCK-12 is blocked by PCK-9
ergon blocked-by PCK-9 PCK-12    # the reverse, by flipping the keys
ergon duplicates PCK-12 PCK-4    # PCK-12 duplicates PCK-4
ergon blocked-by PCK-12 PCK-9 --remove
```

- With one key the issue is the last one worked on, like `ergon move`. With two,
  the first is the issue and the second is the other end.
- The relation always reads left to right, so there is no `blocks` command —
  flip the two keys instead.
- Running the same command twice is harmless: it reports the link was already
  there rather than failing. `--remove` on a link that was never there says so
  and also succeeds.
- Only these two link types can be written. `ergon get` still shows every kind
  Jira reports, including `relates to` and plugin-owned types, so an issue may
  display links no ergon command could have created — remove those in Jira
  ([ADR 0005](./docs/adr/0005-one-command-per-writable-link-type.md)).
- Jira's Parent-Child link type is not ergon's Parent and is deliberately not
  writable here. Set a Parent with `ergon new --parent`.

### Commenting on an issue

`ergon comment` appends a comment to an issue. With no `--body` it opens an
empty buffer in `$VISUAL` or `$EDITOR`; quitting without typing posts nothing.
Without a terminal it opens no editor and fails naming `--body`.

```
ergon comment PCK-12 --body "Deployed to staging; waiting on QA."
ergon comment PCK-12 --body - <<'EOF'
Reproduced on staging.
The 302 target is wrong.
EOF
ergon comment PCK-12
```

- The issue key is optional and falls back to the last one, like `ergon edit`.
- The body is a flag rather than a positional argument, because the key is
  optional: `ergon comment "some text"` would otherwise be ambiguous.
- `--body ""` is an error, not a clear. A description can be blank; a comment
  cannot.
- The receipt names the id of the comment it created, which is the handle every
  later operation needs. `--json` returns the comment itself, in the same shape
  `ergon comments --json` lists.
- Comment bodies are markdown, on the same terms as descriptions
  ([ADR 0010](./docs/adr/0010-markdown-is-ergons-rich-text-format.md)).

Editing one corrects a past utterance, which is a different act from rewriting
what the issue currently asks for — that is `ergon edit`.

```
ergon comment PCK-12 --id 10234            # opens that comment, prefilled
ergon comment PCK-12 --id 10234 --body "…" # replaces it outright
```

- A comment is addressed by its Jira id and nothing else. There are no ordinals
  and no `last`: adding one hands back its id, so the caller already holds it.
  An id belonging to another issue is left to Jira, which 404s.
- ergon refuses to rewrite a comment holding lists, code, tables, or formatting,
  because it cannot reproduce them. `--force` with `--id` and `--body` replaces
  such a comment outright; it is not available on the editor path, where you
  would be amending a copy without seeing what was already lost.
- A restriction on a comment survives the edit, and the receipt names it.
  Restrictions are never authored — there is no `--visibility` flag.
- Editing someone else's comment needs a Jira permission most people do not
  hold; Jira's own 403 is what you get back.

### Reading comments

`ergon comments` prints an issue's comments as a thread, oldest first.

```
ergon comments PCK-12
ergon comments PCK-12 --json
```

```
10234  Lukasz Czyzykowski  2026-08-14 11:04
  Deployed to staging.
  Waiting on QA.

10235  Ada Lovelace  2026-08-15 09:20  (edited 2026-08-15 09:22)  (degraded: table)
  Results below
  Case | Result
```

- The issue key is optional and falls back to the last one, like `ergon edit`.
- Bodies print whole. There is no command that shows a single comment, so a
  truncated listing would leave nothing able to read one.
- `(edited ...)` appears only when a comment has been revised since it was
  written, and `(degraded: ...)` names anything whose formatting could not be
  reproduced in the terminal — read those in Jira
  ([ADR 0010](./docs/adr/0010-markdown-is-ergons-rich-text-format.md)).
- Every page is fetched, so the thread is never a partial history.
- `--json` returns the comments as an array, each carrying `id`, `author`,
  `body`, `bodyDegraded`, and Jira's own `created`/`updated` timestamps.
  `visibility` is present only on a restricted comment, and `author` is Absent
  when Jira hides it.

### Listing and downloading attachments

`ergon attachments` lists the files attached to an issue, one per line, oldest
first, and with `--download <dir>` fetches them.

```
ergon attachments PCK-12
ergon attachments PCK-12 --json
ergon attachments PCK-12 10423 10424
ergon attachments PCK-12 --download ./att
ergon attachments PCK-12 10423 --download ./att --json
```

```
10423  47 KB  2026-10-02 14:11  Jane Doe  checkout-error.png
10424  512 B  2026-10-02 14:30  Jane Doe  server log 2026-10-02.txt
```

- The issue key is optional and falls back to the last one, like
  `ergon comments`, but only when no arguments are given: the first argument is
  always the key, so naming ids means naming the issue too.
- Attachment ids after the key narrow the listing, and `--json`, to those
  Attachments, still in Jira's order. An id that is not on the issue refuses the
  run and prints nothing else; the refusal names every unknown id.
- Columns are id, size, timestamp, author and filename. The filename is last
  because it is the only field that can contain spaces. A hidden author leaves
  its column empty.
- Sizes are rounded, base 1024; the exact byte count is in `--json`. Timestamps
  are Jira's own, as in `ergon comments`.
- A screenshot pasted into a Description reads in `ergon get` as its filename;
  match that filename against this listing to find the Attachment. ergon does
  not make the match itself, because a filename need not be unique on an issue.
- `--json` returns a bare array, each carrying `id`, `filename`, `mimeType`,
  `size` (bytes), Jira's own `created`, and `author`, which is absent when Jira
  hides it. No content URL is included: fetching one needs ergon's credentials.
- `--download <dir>` fetches every selected Attachment — all of them, or only
  the named ids — into `<dir>`, creating it if missing. Each lands at
  `<dir>/<id>-<name>`, where `<name>` is the filename with any directory parts
  dropped (`attachment` if nothing usable is left), so two files sharing a name
  never collide and none can be written outside `<dir>`. Downloaded lines end
  with `→ <absolute path>`, and in `--json` each downloaded object gains an
  absolute `path`; `filename` stays Jira's own.
- Downloads run one at a time, with no progress output, and print once every
  file has landed. Each goes through a temp file renamed into place, so an
  interrupted run never leaves a truncated file under the final name. An
  existing file is overwritten — an Attachment never changes — so re-running is
  safe. There is no size cap: check sizes in the listing and name ids to skip
  the large ones.

### Editing an issue

Name a field and `ergon edit` writes that field; name none and it opens the
current description in `$VISUAL` or `$EDITOR`, where saving an unchanged buffer
writes nothing. Without a terminal it opens no editor and fails naming the field
flags.

```
ergon edit PCK-12
ergon edit PCK-12 --summary "Fix login redirect"
ergon edit PCK-12 --due 2026-09-20
ergon edit PCK-12 --due none
ergon edit PCK-12 --sprint active
ergon edit PCK-12 --sprint none
ergon edit PCK-12 --assignee me
ergon edit PCK-12 --description - <<'EOF'
Steps to reproduce:
1. Log in
EOF
```

- The issue key is optional and falls back to the last one, like `ergon move`.
- A field write never opens an editor, so it is safe to run unattended, and the
  receipt names what was sent: `Updated PCK-12 (due, sprint)`.
- `--due` takes `YYYY-MM-DD`, or `none` to clear the date.
- `--sprint` takes a sprint id, a sprint name, `active` for the sprint Jira
  marks active, or `none` to take the issue out of its sprint. `active` asks
  Jira at the moment of the write, across every scrum board of the project:
  boards sharing a sprint give one answer, and different active sprints on
  different boards are refused, listed, rather than chosen between. It is Jira's
  flag, not the calendar, so it stays on last week's sprint until someone
  completes it. `current` is refused, naming `active`. The same holds for
  `ergon new --sprint`.
- `--assignee` takes `me`, the account ergon's credentials belong to, or `none`
  to unassign the issue. It replaces whoever held the issue without asking; Jira
  keeps the change in the issue's history. Other people cannot be named yet.
  `ergon new --assignee` takes the same values; without it a new issue gets the
  project's default Assignee, which on PCK and PGR is nobody.
- `--description ""` clears the description. `none` is not a sentinel here: it
  would collide with a real description.
- Descriptions are markdown. Markdown ergon cannot express — an image, raw HTML,
  or a nesting Jira's schema forbids such as a table inside a list item — is
  refused by name, with no flag to override it: the draft is yours, so rewrite
  it. There is no way to write literal unformatted text; fence it instead.
- Rewriting a description ergon could not reproduce is refused separately, since
  that content is someone else's and Jira keeps no undo. Pass `--force` with
  `--description` to replace it outright, or edit it in Jira; `--force` is not
  available on the editor path
  ([ADR 0010](./docs/adr/0010-markdown-is-ergons-rich-text-format.md)). That
  refusal applies only when the description is in play — setting a due date on
  an issue whose description holds a panel is not refused.
- Other fields stay where they were: status is `ergon move`, and labels, Client
  SOW and Epic are set at creation by `ergon new`.

## Configuration

Config file location: `~/.config/ergon/config.yaml`.

Project defaults example (used by `ergon new`). Override `sprintFieldId` if
needed:

```yaml
defaults:
  projects:
    PCK:
      fields:
        clientSowFieldId: customfield_10200
        clientSowValue: "Client SOW A"
        labels:
          - client-a
        sprintBoardId: 123
        sprintFieldId: customfield_10020
```

`clientSowFieldId` is required for any project that sets a Client SOW — there is
no default, so `ergon new` fails naming the key rather than writing to a guessed
field ([ADR 0002](./docs/adr/0002-no-default-client-sow-field-id.md)). A project
that never sets one needs no Client SOW configuration at all.

`sprintBoardId` is the board the project lives on. It is the board
`ergon ls --order board` reads, and it settles `--sprint active` when the
project's boards disagree about which sprint is active; projects sharing one
board should name the same id.

## Checks

Run a quick API check:

- `nix develop -c deno run --allow-net --allow-read --allow-env scripts/check-api.ts <ISSUE_KEY>`

## Tests

- `deno task test` (uses read/write/env permissions)

## Coverage

- `deno task coverage` (uses read/write/env permissions)
- `deno task coverage:report`
