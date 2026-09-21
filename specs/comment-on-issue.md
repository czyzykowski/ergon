# Comment on an Issue

> Its markdown-conversion exclusion is superseded by
> [ADR 0010](../docs/adr/0010-markdown-is-ergons-rich-text-format.md) and
> [rich-text-as-markdown.md](./rich-text-as-markdown.md): a Comment body is
> markdown on the same terms as a Description. Everything else here stands,
> including the guard's trigger and `--force`'s meaning.

## Problem Statement

An issue's Description says what the issue asks for. It is the issue's current
statement of itself, and `ergon edit` rewrites it in place. There is nowhere to
put anything that happens _along the way_ — a note that the branch is pushed,
that staging is deployed, that a question is outstanding, that an approach was
abandoned and why.

Today the only way to record that from a terminal is to open Jira in a browser,
which breaks the loop the CLI exists to keep closed. The workaround — appending
to the Description — is worse than no answer: it destroys the distinction
between "what this issue asks for" and "what has happened on it", and under
[ADR 0003](../docs/adr/0003-descriptions-are-plain-text.md) it can only be done
by rewriting the whole Description, risking exactly the flattening that ADR
exists to prevent.

`specs/edit-issue.md` already named this gap when it ruled `--append` out of
scope: _"adding to an issue over time is a future `ergon comment`."_ This is
that command.

The need is sharpest for agents. An agent working a ticket accumulates findings
that belong on the issue but not in its Description, and it cannot open a
browser at all.

## Solution

Two commands, splitting write from read along the same line the CLI already
draws between mutations and discovery commands.

`ergon comment` adds a Comment to an issue, or edits an existing one:

```
ergon comment PCK-12 --body "Deployed to staging; waiting on QA."
ergon comment PCK-12 --body - <<'EOF'
Reproduced on staging.
The 302 target is wrong.
EOF
ergon comment PCK-12                       # opens $EDITOR on an empty buffer
ergon comment PCK-12 --id 10234            # opens $EDITOR on that Comment
ergon comment PCK-12 --id 10234 --body "…" # replaces it outright
```

`ergon comments` reads them back:

```
ergon comments PCK-12
ergon comments PCK-12 --json
```

Both take the issue key optionally, falling back to `state.lastIssueKey` like
every other command that acts on an issue.

A **Comment** is a distinct noun in ergon's language, recorded in `CONTEXT.md`:
a dated, authored remark appended to an issue, which accumulates rather than
replaces, and which is never merged into the Description. That distinction is
what keeps `ergon edit` and `ergon comment` from growing into each other.

## User Stories

1. As an operator, I want to add a Comment to an issue from the terminal, so
   that I can record what happened without opening a browser.
2. As an operator, I want to add a Comment without naming the issue key, so that
   the issue I am already working on is the default.
3. As an operator, I want to write a multi-line Comment in `$EDITOR`, so that
   composing more than a sentence is not a shell-quoting exercise.
4. As an operator, I want quitting the editor without typing anything to post
   nothing, so that changing my mind costs nothing.
5. As an operator, I want a failed editor exit to post nothing, so that a crash
   does not leave a half-written note on the issue.
6. As an operator, I want to correct a Comment I just posted, so that a typo or
   a wrong conclusion does not stand on the record.
7. As an operator, I want editing a Comment to open its current text in
   `$EDITOR`, so that I am amending what is there rather than retyping it.
8. As an operator, I want to see every Comment on an issue with its author and
   date, so that I can read the history as a thread.
9. As an operator, I want each Comment's full text in the listing, so that I do
   not need a second command to read one.
10. As an operator, I want to be told when a Comment is an edited version of an
    earlier one, so that I know the record has been revised.
11. As an operator, I want to be told when a Comment's formatting could not be
    reproduced in the terminal, so that I know to look at it in Jira.
12. As an operator, I want an issue with no Comments to say so plainly, so that
    an empty result is distinguishable from a failure.
13. As an operator, I want `ergon comment` to appear in the interactive menu, so
    that I can find it without reading `--help`.
14. As an agent, I want to add a Comment non-interactively with a single flag,
    so that I can record findings without a terminal.
15. As an agent, I want to pipe a long Comment in on stdin, so that I am not
    limited by argument length or shell quoting.
16. As an agent, I want the id of the Comment I just created returned as data,
    so that I can edit it later without scraping prose or re-listing.
17. As an agent, I want `--json` to return the same Comment shape whether I
    added or edited, so that one parser handles both.
18. As an agent, I want to read every Comment on an issue as JSON, so that I can
    reason about a ticket's history rather than only its Description.
19. As an agent, I want Comments returned oldest-first, so that array order and
    conversation order agree.
20. As an agent, I want _all_ Comments returned rather than the first page, so
    that I never act on a partial history believing it complete.
21. As an agent, I want any Comment's text rendered however it was authored, so
    that a Comment written as a bullet list in the web UI does not read as
    blanks.
22. As an agent, I want to be told per Comment which constructs lost their
    shape, so that I know when I am reading a degraded rendering.
23. As an agent, I want the Comment JSON shape to mirror `get --json`'s
    `description`/`descriptionDegraded` pair, so that one mental model covers
    both.
24. As an operator, I want ergon to refuse to rewrite a Comment holding
    formatting it cannot reproduce, so that I do not silently destroy someone's
    code block or mention.
25. As an operator, I want `--force` available when I have deliberately decided
    to flatten a Comment, so that the refusal is a guard and not a wall.
26. As an operator, I want `--force` rejected on the editor path, so that I am
    never editing a corrupted copy of a Comment I cannot see the whole of.
27. As an operator, I want `--force` rejected when adding, so that a flag
    meaning "destroy something deliberately" is never a silent no-op.
28. As an operator, I want an existing Comment's visibility restriction to
    survive my edit, so that editing a note never widens who can see it.
29. As an operator, I want a restriction named in the receipt when one is
    present, so that the one case where preservation matters is not silent.
30. As an operator, I want to be told which fields were written, so that the
    output is a receipt I can check.
31. As an operator, I want an attempt to post an empty Comment to fail, so that
    a mistyped command does not put a blank note on the issue.
32. As an operator, I want Jira's own error when I lack permission to edit
    someone else's Comment, so that the reason is accurate rather than guessed.
33. As an operator, I want `ergon comment` never to claim `state.lastIssueKey`,
    so that commenting on another issue does not move my working context.
34. As a maintainer, I want the Comment mapping and the thread rendering to be
    pure functions with unit tests, so that the `--json` contract is enforced
    without live Jira.

## Implementation Decisions

### Domain

- **Comment** is added to `CONTEXT.md` as its own term: a dated, authored remark
  appended to an issue, accumulating rather than replacing, never merged into
  the Description. It is deliberately not a mode of `ergon edit`, which rewrites
  the issue's own fields.
- The worklog note that `ergon log --description` writes is a _worklog_ comment
  and is not a Comment in this sense. Different concept, different endpoint,
  untouched here.

### Command surface

- Two flat commands, `comment` and `comments`. No subcommands — nothing in the
  CLI uses them, and the flat-verb convention is worth more than keeping one
  noun in one place.
- `ergon comment [issueKey]` adds by default and edits when `--id` is given.
  `--id` is the switch from "create" to "operate on this existing one".
- `ergon comments [issueKey]` is read-only and takes `--json`. It sits beside
  `labels` and `client-sows` as a discovery command.
- Both take the issue key optionally and fall back to `state.lastIssueKey`. The
  plural takes it optionally too, matching its singular twin rather than `get`,
  so that one letter of difference does not change how the key resolves.
- Neither writes `state.lastIssueKey`. Both act _on_ an issue rather than
  switching _to_ one, matching `edit` and `move`.
- Missing key throws the existing sentence:
  `"Provide an issue key or run from a
  previous issue."`
- `menu` gains `Comment on issue` → `comment`. It does not gain `comments`;
  discovery commands (`get`, `labels`, `client-sows`) are not in the menu.
- No `--non-interactive` flag. The commands error rather than prompt, so they
  are already safe to script.

### Body input

- `--body <text>` supplies the Comment inline. `--body -` reads it from stdin.
  Both mirror `edit --description`.
- The body is a flag rather than a positional argument. The issue key is
  optional, so a positional body would make `ergon comment "some text"`
  ambiguous, resolvable only by sniffing the string for a key-like shape — the
  kind of guesswork ADR 0004 declined.
- With neither `--body` nor stdin, open `$VISUAL`, falling back to `$EDITOR`.
  With neither set, throw telling the operator to set one. No `vi` fallback.
- On add the buffer starts empty; on edit it is prefilled with the Comment
  rendered to text.
- A non-zero editor exit sends nothing. A buffer returned byte-identical to what
  was written sends nothing and reports no change — on add, that means an
  untouched empty buffer posts nothing.
- No commented template in the editor buffer. Stripping rules are a new way to
  lose text silently, and `edit` has no such machinery.
- `--body ""` is an error rather than a clear. This is the one place the `edit`
  analogy deliberately breaks: `edit --description ""` clears the field, but a
  Comment cannot be empty — Jira rejects an empty ADF document, and an empty
  Comment means nothing.

### Rich text

- ADR 0003 and ADR 0004 extend to Comments verbatim. No new ADR: this is two
  existing decisions applying to a second field, not new reasoning.
- Writing uses the existing `toAdf`, so ergon emits only `doc`/`paragraph`/
  `text`.
- Reading uses the existing `renderAdf`, so any Comment renders, with whatever
  lost its shape named alongside the text.
- Editing runs the existing `unsupportedAdfNodes` over the fetched Comment and
  refuses when it reports anything, naming what it found and pointing at
  `--force` — the same shape of refusal `ergon edit` gives.
- Adding is unaffected by all of this. There is nothing to destroy.
- Expanding `SUPPORTED_NODES` to preserve mentions or emoji is explicitly not
  done. That is the half-implemented converter ADR 0003 declined.

### `--force`

Legal in exactly one combination — `--id` together with a supplied body:

| Invocation                      | Behaviour                                          |
| ------------------------------- | -------------------------------------------------- |
| `comment KEY --body "…"`        | Posts. `--force` throws — nothing to destroy.      |
| `comment KEY --id N --body "…"` | Refuses on rich ADF; `--force` overrides.          |
| `comment KEY --id N` (editor)   | Refuses on rich ADF; `--force` is itself an error. |
| `comment KEY` (editor, add)     | Empty buffer, no fetch, nothing to lose.           |

- The editor carve-out is ADR 0003's, carried across: prefilling a buffer from a
  document ergon cannot render faithfully means editing a corrupted copy without
  being able to see what was lost.
- Both illegal uses throw rather than being ignored. Silently dropping a flag
  that means "destroy something deliberately" is the wrong failure.
- The two errors say which constraint was violated, because they are different
  mistakes: `"--force applies only to --body."` on the add path, and a message
  naming the editor carve-out on the `--id`-without-body path.

### Identity

- A Comment is addressed by its Jira id and nothing else. No ordinals — they are
  positional against a list that changes, and telling an ordinal from an id
  means comparing magnitudes, which is guesswork.
- No `--id last`. Resolving "mine" needs an account id, and the add path returns
  the new id anyway, so the caller already holds it.
- No remembered last-comment id. That would be Remembered state, which
  [ADR 0001](../docs/adr/0001-non-interactive-ignores-remembered-state.md) makes
  interactive-only in both directions — useless in exactly the agent case that
  would want it.
- An `--id` belonging to another issue is left to Jira, whose
  `PUT /issue/{key}/comment/{id}` 404s on a mismatch.

### Visibility

- A fetched Comment's `visibility` is echoed back verbatim in the update
  payload. ergon never constructs one, and there is no `--visibility` flag.
- The reason it must be echoed rather than omitted: Atlassian does not document
  the omission behaviour, and the field evidence is that a body-only update
  _clears_ an existing restriction — the community-reported way to unrestrict a
  comment is to drop the key. Omitting it would therefore risk widening who can
  see a note, silently, on a 200 response.
- When a restriction is present, the receipt names it, so the one case where the
  preservation matters is not silent.
- `jsdPublic` is ignored entirely. It is a Jira Service Management construct and
  there are no JSM projects here; everything is org-scoped and nothing is
  customer-facing.
- No ADR: preserving a field verbatim is the unsurprising default.

### Permissions

- Editing a Comment written by someone else needs Jira's "Edit All Comments"
  permission. ergon does not check client-side; Jira's 403 propagates through
  the existing `Jira API request failed (403): …` path.
- This follows `edit`'s precedent that summary values are not validated
  client-side. It is also the only correct option: all ergon holds is
  `config.jira.email`, and Jira Cloud omits `emailAddress` from user objects
  under default profile-visibility settings, so there is frequently nothing to
  compare against. A wrong guard refusing an edit the caller is entitled to make
  is worse than no guard.

### API contract — `ergon comments --json`

A bare array, matching `labels --json` and `client-sows --json` rather than
wrapping in an object:

```json
[
  {
    "id": "10234",
    "author": "Lukasz Czyzykowski",
    "body": "Deployed to staging.\nWaiting on QA.",
    "bodyDegraded": ["table"],
    "created": "2026-08-14T11:04:31.000+0100",
    "updated": "2026-08-14T11:09:02.000+0100"
  }
]
```

- `body`/`bodyDegraded` mirror `get --json`'s `description`/
  `descriptionDegraded`, and carry the same meaning.
- `author` is `displayName` only, matching how `mapIssue` handles `assignee`.
  `accountId` is deliberately excluded: ergon does not resolve account identity
  anywhere, and narrowing the shape is the same call `client-sows --json` made
  when it dropped `disabled`.
- `visibility` is present only when the Comment carries a restriction, as
  `{ "type": "role", "value": "…" }`. Absent otherwise, which is the normal
  case.
- `created`/`updated` are Jira's own timestamps, passed through unparsed, as
  `get --json` already does.
- Oldest-first, which is Jira's own order and the order the conversation
  happened in.
- Paginated to completion, matching `listLabels`. A silently truncated history
  is the failure ADR 0004 was written about: an agent seeing part of a thread
  and proceeding as though it were whole.
- Note that this listing is deliberately richer than what `ergon comment --id`
  will accept back. A Comment holding a mention renders cleanly here and still
  refuses to edit. That is the disagreement ADR 0004 already documents between
  `descriptionDegraded` and `unsupportedAdfNodes`, not a new one.

### `--json` on the mutation

- `ergon comment --json` prints the resulting Comment as a single object in the
  element shape above, whether it was added or edited. Jira's POST and PUT both
  return the comment, so this costs no extra request.
- This departs from `edit`'s stated principle that a mutation's output is a
  receipt rather than data. The distinction is not "mutations do not return
  data" but "did this mutation mint an identifier the caller must now be able to
  name". `edit` changes fields whose values the caller already has; `comment`
  creates an id that did not exist and that every later operation needs. Without
  it, an agent would have to regex the id out of prose.
- Recorded in `NOTES.md` so the next command facing the question reads the two
  as principled rather than inconsistent.

### Human output

`ergon comments` prints a thread — header line, then the body indented two
spaces to match `get`'s field indentation:

```
10234  Lukasz Czyzykowski  2026-08-14 11:04
  Deployed to staging.
  Waiting on QA.

10235  Ada Lovelace  2026-08-15 09:20  (edited 2026-08-15 09:22)  (degraded: table)
  Results below
  Case | Result
```

- Full bodies, not first-line summaries. There is no `ergon comment show`, so a
  truncated listing would leave human mode unable to read a Comment at all, and
  truncating history is the failure ADR 0004 exists to prevent — doing it only
  in the human path just picks a different victim.
- `(edited …)` appears only when `updated` differs from `created`. Otherwise it
  is noise on every line.
- Degradation is named on the header line, where it cannot be missed.
- Timestamps render as `YYYY-MM-DD HH:MM`, while `--json` keeps Jira's raw
  strings — the same split `get` already makes.
- Empty result prints `No comments found.`, matching `labels` and `ls`.

Mutation receipts:

```
Added comment 10234 to PCK-12
Updated comment 10234 on PCK-12
Updated comment 10234 on PCK-12 (restricted: role Developers)
```

### Modules

- `types.ts` gains `JiraComment`, beside `JiraIssue`.
- `JiraClient` gains `listComments` (paginating to completion), `addComment`,
  and `updateComment`, all returning `JiraComment`.
- `mapComment` sits beside `mapIssue` in the Jira client, but is **exported**
  where `mapIssue` is not. It is the `--json` contract, and contracts in this
  repo get tests.
- One file per registered command, matching every other command. They share
  nothing at the command layer; the only shared piece is `mapComment`, which is
  client-layer.
- The thread renderer is a pure exported function in the `comments` command
  module, taking `JiraComment[]` and returning the display string.

## Testing Decisions

A good test here exercises external behaviour — what the CLI returns and prints
— not how it got there. The command modules themselves are not unit-tested: they
need live Jira, which is the precedent set in `specs/move-issue-status.md` and
`specs/edit-issue.md`. So anything worth testing is pulled into a pure function
first, exactly as `resolveFields` was pulled out of `new` and the ADF helpers
were pulled out of the client.

Two seams, both pure, one feeding the other:

1. **`mapComment`** — raw Jira comment JSON in, `JiraComment` out. This is the
   `--json` contract, so it is the seam that matters most.
2. **The thread renderer** — `JiraComment[]` in, display string out. Consumes
   the output of the first seam, so the two compose rather than overlapping.

Prior art: `tests/new_fields_test.ts` tests `resolveFields` as a pure precedence
contract; `tests/adf_test.ts` tests `toAdf`/`fromAdf`/`unsupportedAdfNodes`
without touching the client. `tests/comments_test.ts` follows both.

Cases to cover:

- A plain Comment mapping to `body` with an empty `bodyDegraded`.
- A Comment holding a table or a bullet list, whose text survives and whose lost
  constructs are named in `bodyDegraded`.
- A Comment with a `visibility` restriction, which appears in the mapped shape.
- A Comment without one, where the key is absent rather than null.
- `updated` equal to `created`, and `updated` later than `created`, driving the
  presence and absence of `(edited …)`.
- A multi-line body indenting every line in the thread rendering.
- An empty list rendering as `No comments found.`
- Ordering preserved oldest-first through both seams.

The ADF behaviour itself needs no new tests; `unsupportedAdfNodes` and
`renderAdf` are already covered and are reused unchanged.

## Out of Scope

- **Deleting a Comment.** It is the one Comment operation with no recovery path
  at all, and there is no stated need. Every guard in this spec protects text
  from destruction; a command whose purpose is destroying it sits oddly beside
  them. Trivially addable later, on a day when the confirmation it needs can be
  thought about properly.
- **Threaded or child Comments.** A Jira Service Management construct; there are
  no JSM projects here.
- **Setting or changing visibility.** No `--visibility` flag in either
  direction. Existing restrictions are preserved, never authored.
- **`ergon move --comment`.** `specs/move-issue-status.md` already ruled
  transition fields out — bare transition only.
- **Worklog comments.** `ergon log --description` writes a different thing to a
  different endpoint. Including the bare-string body at the worklog call site,
  which looks wrong against the v3 API and is left alone here.
- **`--append` on `ergon edit`.** Superseded rather than deferred:
  `ergon
  comment` is the answer that deferral pointed at.
- **A Comment count on `ergon get --json`.** Jira's issue GET returns the
  comment field as a paginated payload rather than a count, so it is not free,
  and `get` stays bounded.
- **Markdown-to-ADF conversion**, in either direction, for Comments as for
  Descriptions. ADR 0003 stands. _Superseded by ADR 0010: it is now done, for
  Comments on the same terms as for Descriptions._
- **Unit tests for the command modules**, which need live Jira.

## Further Notes

- `CONTEXT.md` already carries the **Comment** entry; it was written when the
  term was settled rather than at the end.
- No new ADR. Two candidates were considered and both fail the bar: extending
  0003/0004 to a second field needs no new reasoning, and preserving a field
  verbatim is the unsurprising default. The `--json`-on-a-mutation decision is
  the one that visibly contradicts a written principle, but it is an output
  format on a new command and therefore cheap to reverse — it belongs in
  `NOTES.md`.
- Three entries for `NOTES.md`: why `comment` has `--json` where `edit` does
  not; that the 0003/0004 regime was extended deliberately; and that
  `visibility` is echoed verbatim while `jsdPublic` is ignored outright.
- `CHANGELOG.md` gets an `Added` entry, and `README.md` a section following the
  shape of "Editing an issue".
- The design behind every decision here was settled in a grilling session before
  any code was written; the reasoning is recorded inline above rather than left
  to be rediscovered.
