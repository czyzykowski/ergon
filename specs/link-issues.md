# Link Issues Commands

## Objective

Add `blocked-by` and `duplicates` commands that create and remove Jira issue
links via `POST`/`DELETE /rest/api/3/issueLink`, and show an issue's links in
`ergon get`. One command per writable link type rather than a generic `link`
command with a type flag, per
[ADR 0005](../docs/adr/0005-one-command-per-writable-link-type.md).

## Success Criteria

- [x] `ergon blocked-by PCK-1 PCK-2` creates a link reading "PCK-1 is blocked by
      PCK-2", sending
      `{"type":{"name":"Blocks"},"inwardIssue":{"key":"PCK-2"},"outwardIssue":{"key":"PCK-1"}}`
      — Jira's `inwardIssue` is the end that reads with the _outward_ phrase, so
      the subject is sent as the `outwardIssue`
- [x] `ergon duplicates PCK-1 PCK-2` creates a link reading "PCK-1 duplicates
      PCK-2", sending the subject as the `inwardIssue`
- [x] The relation reads left to right, so the reverse is the same command with
      the keys flipped; there is no `blocks` command
- [x] With one argument the subject is `state.lastIssueKey` and the argument is
      the other end
- [x] With one argument and no `lastIssueKey`, both commands throw exactly:
      `"Provide an issue key or run from a previous issue."`
- [x] Neither command writes `state.lastIssueKey`, matching `move` and `edit`
- [x] Every invocation reads the subject's links first, via
      `getIssueFields(key, ["issuelinks"])`, which also settles that the subject
      exists before anything is written
- [x] Creating a link that already exists sends no POST and prints
      `PCK-1 is already blocked by PCK-2` / `PCK-1 already duplicates PCK-2`,
      exiting 0 — Jira's own duplicate handling is a silent 201 no-op, so
      without the pre-read the receipt would claim a create that did nothing
- [x] Before creating, the target is read via `getIssueFields(key, ["summary"])`
      so a mistyped key names itself rather than arriving as Jira's 404, which
      covers five distinct causes and cannot say which issue it meant
- [x] Success prints `Linked PCK-1: is blocked by PCK-2 (Pin the runner image)`,
      carrying the target's summary
- [x] `--remove` deletes the matching link by id and prints
      `Unlinked PCK-1: is blocked by PCK-2`
- [x] `--remove` with no matching link sends no DELETE and prints
      `PCK-1 is not blocked by PCK-2` / `PCK-1 does not duplicate PCK-2`,
      exiting 0 — a no-op is a normal outcome, matching `edit`'s
      `No changes for PCK-1`
- [x] `--remove` performs no target read, since a matched link proves the target
- [x] Matching is direction-aware: `blocked-by` matches only links whose
      counterpart sits in `inwardIssue`, `duplicates` only those in
      `outwardIssue`, so the wrong direction never matches
- [x] Matching ignores link types it was not asked about, and compares keys
      case-insensitively
- [x] `mapIssue` maps `fields.issuelinks` to `links` on `JiraIssue`, narrowed to
      `{id, phrase, key, summary, status}`, in the order Jira reported them
- [x] `phrase` reads from the issue asked about: a counterpart in `outwardIssue`
      takes `type.outward`, one in `inwardIssue` takes `type.inward`
- [x] Every link type Jira reports is rendered, including `relates to` and
      plugin-owned types no ergon command can create
- [x] `ergon get` prints a `links:` block after `assignee:`, one line per link
      as `<phrase> KEY [status] summary`, and omits the block entirely when
      there are none
- [x] `links` is absent from `ls` and `search` — `SEARCH_FIELDS` does not list
      `issuelinks`, so those paths map to `[]`
- [x] Jira request failures report Jira's `errorMessages` rather than the status
      and raw body, falling back to the raw body when there is nothing to unwrap
- [x] `registerLinkCommands` is called in `main.ts`
- [x] The `menu` command includes entries for both commands
- [x] Unit tests cover rendering both directions, a symmetric type, absent and
      malformed links, direction-aware matching for both types, and both create
      bodies
- [x] `deno check src/main.ts` — zero type errors
- [x] `deno task test` — 75 pass, the 63 that existed plus 12 for `src/links.ts`

## Out of Scope

- A generic `ergon link --as <phrase>` and an `ergon link-types` discovery
  command, both rejected in ADR 0005
- `relates`, `clones`, and the nine plugin-owned link types — writable link
  types are `Blocks` and `Duplicate` only
- Jira's `Parent-Child` link type, which is not ergon's Parent; setting a Parent
  stays with `ergon new --parent`
- Remote links (a URL hung off an issue), a separate Jira endpoint and feature
- Link flags on `ergon new`; `new` writes `state.lastIssueKey`, so
  `ergon new ... && ergon blocked-by PCK-2` already links what was just created
- Links in `ls` and `search`, which would add a links payload to every row
- The optional `comment` field on the create body
- `--json` output on the write commands — a mutation's output is a receipt, not
  data, matching `specs/edit-issue.md`
- Unit tests for the commands themselves, which need live Jira
