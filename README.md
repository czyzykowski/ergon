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
```

Both always query Jira rather than the metadata cache, so they report what is
valid now. `--json` gives labels as `["a", "b"]` and Client SOWs as
`[{"id": "...", "value": "..."}]`; `ergon new --client-sow` accepts either the
id or the value.

### Scripted creation

With `--non-interactive`, `ergon new` never prompts and inherits Client SOW and
labels from the parent issue:

```
ergon new "Fix login" --non-interactive --parent PCK-12
```

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
  "labels": ["backend"],
  "created": "2026-08-01T09:12:00.000+0100",
  "updated": "2026-08-14T11:04:31.000+0100",
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
  ]
}
```

- `description` is the issue body rendered to markdown, or `null` when there is
  none. Lists, code blocks, headings, quotes, links, and mentions all survive.
- `descriptionDegraded` names constructs whose shape markdown could not carry —
  `["table"]` means the cells are all there and the grid is not. It is `[]` when
  the body rendered cleanly. Text is never dropped without being reported here
  ([ADR 0004](./docs/adr/0004-descriptions-read-richer-than-they-write.md)).
- `statusCategory` is the stable key (`new`, `indeterminate`, `done`), so it can
  be tested against without knowing a project's status names.
- `created` and `updated` are Jira's own timestamps, passed through unparsed.
- `priority` is the Jira Priority name, or `null`. It is reported but never
  ordered by: the ordering the board carries is `rank`.
- `dueDate` is Jira's due date as `YYYY-MM-DD`, or `null`.
- `sprints` is the issue's whole sprint history in the board's own order, not
  chronology — a ticket carried over twice reports three, and one planned ahead
  reports a sprint it is not yet working in. `[]` means no sprint.
- `clientSow` is the Client SOW's display value, or `null`.
- `links` holds every link Jira reports, each `phrase` reading from the issue
  you asked about — `"is blocked by"` on one issue is `"blocks"` on the other.
  Links only come back from `ergon get`; `ls` and `search` leave them out.
- A field ergon did not fetch is **missing** rather than `null`: `links` has no
  key at all on an issue that came from `ls`, and `sprints`/`clientSow` have
  none for a project config has never heard of. `null` always means ergon looked
  and Jira had nothing
  ([ADR 0006](./docs/adr/0006-absent-means-not-fetched.md)).
- The rendering is one-way: text read here and passed back to
  `ergon edit --description` is written as flat paragraphs, so a real list
  becomes text shaped like one. Read with `get`, write with the source text.

The human-readable `ergon get` output does not print the body, but does list
links:

```
PCK-12 [In Progress] Fix login redirect
  type:     Task
  project:  PCK
  assignee: Lukasz Czyzykowski
  links:
    is blocked by PCK-9 [Done] Pin the runner image
    relates to PCK-31 [To Do] Audit CI secrets
```

### Listing issues

```
ergon ls --json                            # the same issue shape, as an array
ergon ls --project PCK --order rank        # the board's own order
ergon ls --sprint --json
ergon ls --since 2026-09-17 --json         # only what has moved since
```

- `--json` emits an array of the object `ergon get --json` returns, so one
  parser handles both, and one request replaces one `get` per key. An empty
  result is `[]`; without `--json` it stays `No issues found.`
- `--order` takes `rank` or `updated`, and defaults to `updated`. `rank` is the
  order set by dragging on the board, and it requires `--project`: a rank
  compares two issues on one board and says nothing across boards
  ([ADR 0009](./docs/adr/0009-rank-does-not-cross-boards.md)). `--sprint` does
  not change the ordering.
- `--since` takes a date, not an instant, and bounds the list to issues updated
  on or after it.
- Naming a project asserts ergon is configured for it, so `--project` on an
  undeclared project is an error. A cross-project sweep that happens to return
  an issue from an unknown project still returns it, with `sprints` and
  `clientSow` missing.

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
- Comments are written as plain text, like descriptions
  ([ADR 0003](./docs/adr/0003-descriptions-are-plain-text.md)).

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
  ([ADR 0004](./docs/adr/0004-descriptions-read-richer-than-they-write.md)).
- Every page is fetched, so the thread is never a partial history.
- `--json` returns the comments as an array, each carrying `id`, `author`,
  `body`, `bodyDegraded`, and Jira's own `created`/`updated` timestamps.
  `visibility` is present only on a restricted comment.

### Editing an issue

Name a field and `ergon edit` writes that field; name none and it opens the
current description in `$VISUAL` or `$EDITOR`, where saving an unchanged buffer
writes nothing.

```
ergon edit PCK-12
ergon edit PCK-12 --summary "Fix login redirect"
ergon edit PCK-12 --due 2026-09-20
ergon edit PCK-12 --due none
ergon edit PCK-12 --sprint current
ergon edit PCK-12 --sprint none
ergon edit PCK-12 --description - <<'EOF'
Steps to reproduce:
1. Log in
EOF
```

- The issue key is optional and falls back to the last one, like `ergon move`.
- A field write never opens an editor, so it is safe to run unattended, and the
  receipt names what was sent: `Updated PCK-12 (due, sprint)`.
- `--due` takes `YYYY-MM-DD`, or `none` to clear the date.
- `--sprint` takes a sprint id, a sprint name, `current` for the board's active
  sprint, or `none` to take the issue out of its sprint. `current` asks Jira at
  the moment of the write, and refuses when the project has several boards and
  no configured `sprintBoardId`.
- `--description ""` clears the description. `none` is not a sentinel here: it
  would collide with a real description.
- ergon writes descriptions as plain text. It refuses to rewrite one containing
  lists, code, tables, or formatting, because it cannot reproduce them; pass
  `--force` with `--description` to replace such a description outright, or edit
  it in Jira. `--force` is not available on the editor path
  ([ADR 0003](./docs/adr/0003-descriptions-are-plain-text.md)). That refusal
  applies only when the description is in play — setting a due date on an issue
  whose description holds a table is not refused.
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

## Checks

Run a quick API check:

- `nix develop -c deno run --allow-net --allow-read --allow-env scripts/check-api.ts <ISSUE_KEY>`

## Tests

- `deno task test` (uses read/write/env permissions)

## Coverage

- `deno task coverage` (uses read/write/env permissions)
- `deno task coverage:report`
