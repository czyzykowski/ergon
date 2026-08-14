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
  "updated": "2026-08-14T11:04:31.000+0100"
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
- The rendering is one-way: text read here and passed back to
  `ergon edit --description` is written as flat paragraphs, so a real list
  becomes text shaped like one. Read with `get`, write with the source text.

The human-readable `ergon get` output is unchanged and does not print the body.

### Editing an issue

`ergon edit` changes an issue's description and summary. With no flags it opens
the current description in `$VISUAL` or `$EDITOR`; saving an unchanged buffer
writes nothing.

```
ergon edit PCK-12
ergon edit PCK-12 --summary "Fix login redirect"
ergon edit PCK-12 --description - <<'EOF'
Steps to reproduce:
1. Log in
EOF
```

- The issue key is optional and falls back to the last one, like `ergon move`.
- `--description ""` clears the description. `none` is not a sentinel here — it
  is only meaningful for fields with enumerable values.
- ergon writes descriptions as plain text. It refuses to rewrite one containing
  lists, code, tables, or formatting, because it cannot reproduce them; pass
  `--force` with `--description` to replace such a description outright, or edit
  it in Jira. `--force` is not available on the editor path
  ([ADR 0003](./docs/adr/0003-descriptions-are-plain-text.md)).
- Other fields stay where they were: status is `ergon move`, and labels, Client
  SOW, Epic, and sprint are set at creation by `ergon new`.

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
