# Edit Issue Command

> Partly superseded by [edit-issue-fields.md](./edit-issue-fields.md), which
> adds `--due` and `--sprint` and changes when the editor opens and when the
> Description is fetched. This file remains the record of what originally
> shipped.

## Objective

Add an `edit` command to ergon that updates a Jira issue's description and
summary via `PUT /rest/api/3/issue/{key}`, refusing to flatten descriptions
whose existing content ADF cannot round-trip through `toAdf`.

## Success Criteria

- [x] `ergon edit PCK-123 --summary "New title"` sends
      `PUT /rest/api/3/issue/PCK-123` with `{"fields":{"summary":"New title"}}`
      and no `description` key
- [x] `ergon edit PCK-123 --description "Body"` sends the description as ADF via
      the existing `toAdf`, and no `summary` key
- [x] Both flags together send both fields in a single PUT
- [x] `ergon edit PCK-123 --description -` reads the description body from
      stdin; `--summary -` has no special meaning and is taken literally
- [x] `ergon edit PCK-123 --description ""` clears the field, sending
      `description: null` — Jira clears a rich-text field with null, and an
      empty ADF doc is rejected
- [x] `ergon edit` with no argument uses `state.lastIssueKey`
- [x] `ergon edit` with no argument and no `lastIssueKey` throws exactly:
      `"Provide an issue key or run from a previous issue."`
- [x] `edit` never writes `state.lastIssueKey`, matching `move`
- [x] Every invocation fetches the description before writing, via the existing
      `getIssueFields(key, ["description"])`, which returns raw ADF
- [x] When the fetched description contains any ADF node type outside `doc`,
      `paragraph`, and `text` — or any mark, which is formatting carried on a
      text node rather than a node type — the command throws without sending a
      PUT, naming what it found and pointing at `--force`
- [x] `--force` suppresses that refusal for `--description` and stdin
- [x] `--force` with no `--description`/stdin (the editor path) throws rather
      than opening an editor, per
      [ADR 0003](../docs/adr/0003-descriptions-are-plain-text.md)
- [x] `ergon edit PCK-123` with neither flag renders the fetched description to
      text, writes it to a `.txt` temp file, and opens `$VISUAL`, falling back
      to `$EDITOR`
- [x] With neither `$VISUAL` nor `$EDITOR` set, the editor path throws telling
      the operator to set `$EDITOR` — it does not fall back to `vi`
- [x] A non-zero editor exit sends no PUT
- [x] A buffer identical to what was written sends no PUT and reports no change
- [x] The editor path edits description only; summary is unreachable without its
      flag
- [x] The temp file is removed whether or not the PUT happens
- [x] Success prints `Updated PCK-123 (description, summary)`, naming only the
      fields actually sent, in that order
- [x] `JiraClient.updateIssue(key, fields)` returns `Promise<void>` and handles
      the 204 empty body
- [x] `toAdf` moves from `src/api/jira.ts` to `src/adf.ts` alongside `fromAdf`
      and `unsupportedAdfNodes`, so the pure ADF logic is testable without the
      client
- [x] `registerEditCommand` is called in `main.ts`
- [x] The `menu` command includes an entry for `edit`
- [x] Summary values are not validated client-side; Jira's 400 propagates
- [x] Unit tests cover the ADF loss detector and the ADF-to-text renderer,
      including an empty/absent description and a `toAdf` round trip
- [x] `deno check src/main.ts` — zero type errors
- [x] `deno task test` — 44 pass, the 35 that existed plus 9 for `src/adf.ts`

## Out of Scope

- Any field other than description and summary — labels, Client SOW, Epic,
  Parent, assignee, and sprint stay with `ergon new`; status stays with
  `ergon move`
- Markdown-to-ADF or faithful ADF-to-markdown conversion (ADR 0003)
- `--append`; adding to an issue over time is a future `ergon comment`
- `--json` output — a mutation's output is a receipt, not data
- A `--non-interactive` flag; the command errors rather than prompting, so it is
  already safe to script
- Unit tests for the command itself, which needs live Jira, matching the
  precedent in `specs/move-issue-status.md`
- Fixing the missing `--allow-run` in the `deno install` line in `AGENTS.md`
