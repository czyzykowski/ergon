# Read an Issue's Attachments

**Status:** ready-for-agent

## Problem Statement

An agent working a ticket reads it through `ergon get`, and the Description it
reads is Degraded wherever the reporter pasted a screenshot or attached a log:
the image reads as its filename and nothing more. The ticket's most important
evidence — the error on screen, the stack trace in the log — is named and then
withheld. A person would open the browser. An agent has no browser and no
credentials outside ergon, so today the Degraded marker is a dead end: it knows
there was an Attachment called `checkout-error.png` and has no way to look at
it.

## Solution

A new command, `ergon attachments [KEY] [ID...] [--download <dir>] [--json]`.

Without `--download` it lists the issue's Attachments — id, size, when, who,
filename — so the agent can see what exists and how big it is. With
`--download <dir>` it fetches them into `<dir>`, each as `<id>-<filename>`, and
reports the absolute path each one landed at, which the agent can pass straight
to whatever reads files. Naming ids narrows either mode to those Attachments, so
an agent that needs one screenshot does not also pull the 180 MB screen
recording beside it.

The agent connects a Degraded media node in the Description to an Attachment by
filename, using the listing. ergon does not make that connection for it — see
Implementation Decisions.

## User Stories

1. As an agent, I want to list an issue's Attachments, so that I know what
   evidence the reporter left beyond the Description.
2. As an agent, I want each Attachment's id in the listing, so that I can name
   exactly the one I need.
3. As an agent, I want each Attachment's size in bytes, so that I can decide
   whether a file is worth fetching before I fetch it.
4. As an agent, I want each Attachment's mime type, so that I know whether I can
   read it as an image, as text, or not at all.
5. As an agent, I want each Attachment's filename, so that I can match it to the
   filename a Degraded Description shows me.
6. As an agent, I want each Attachment's created timestamp and author, so that I
   can tell an original upload from a later re-upload under the same name.
7. As an agent, I want `--json` to return a bare array of Attachments, so that
   it reads like every other discovery command in ergon.
8. As an agent, I want Attachments in Jira's order, oldest first, so that the
   listing reads in the order the evidence was added.
9. As an agent, I want `--download <dir>` with no ids to fetch every Attachment,
   so that a ticket with a handful of small files takes one command.
10. As an agent, I want to name Attachment ids alongside `--download`, so that I
    fetch only what I need.
11. As an agent, I want ids without `--download` to narrow the listing, so that
    ids mean "these Attachments" in every mode.
12. As an agent, I want a downloaded file named `<id>-<filename>`, so that two
    Attachments both called `screenshot.png` never overwrite each other.
13. As an agent, I want each downloaded Attachment's absolute `path` in the
    output, so that I can read it without rebuilding its name or knowing my
    working directory.
14. As an agent, I want `path` Absent on any Attachment not downloaded in this
    run, so that its absence means "not downloaded" and never "nowhere".
15. As an agent, I want a run naming an id that is not on the issue to refuse
    before downloading anything, so that an id copied from the wrong issue fails
    loudly instead of half-succeeding.
16. As an agent, I want the refusal to name every unknown id, so that I can fix
    the invocation in one go.
17. As an agent, I want a re-run to overwrite what an earlier run downloaded, so
    that re-running is safe and repairs anything left broken.
18. As an agent, I want a download that dies midway to leave no file under the
    final name, so that a truncated file is never mistaken for the real one.
19. As an agent, I want a missing `<dir>` created for me, so that I do not need
    a separate step before downloading.
20. As an agent, I want a filename containing `/` or `..` to be unable to write
    outside `<dir>`, so that a hostile or careless upload cannot reach the rest
    of the filesystem.
21. As an agent, I want KEY to fall back to the last issue when I give no
    arguments, so that `attachments` behaves like `comments`.
22. As an agent, I want the first argument always to be the issue key, so that
    `ergon attachments 10423` never quietly means an Attachment on some other
    issue.
23. As an operator, I want a plain listing of one line per Attachment, so that I
    can scan what is attached without opening the browser.
24. As an operator, I want sizes shown as KB or MB, so that I can see at a
    glance which file is the large one.
25. As an operator, I want timestamps shown as Jira wrote them, sliced to
    `YYYY-MM-DD HH:MM`, so that they read the same as in `ergon comments`.
26. As an operator, I want `→ <path>` after each downloaded line, so that I can
    see where every file went.
27. As an operator, I want an issue with nothing attached to say
    `No attachments found.`, so that an empty answer is not mistaken for a
    failure.
28. As an operator, I want the filename last on each line, so that a filename
    with spaces does not break the columns before it.
29. As an agent, I want no content URLs in the output, so that I am not tempted
    to fetch a URL that needs credentials I do not have.

## Implementation Decisions

### Domain

- **Attachment** is a new term in `GLOSSARY.md`. Its content never changes,
  because replacing a file makes a new Attachment with a new id. That
  immutability is what makes always-overwrite safe.
- ergon never links a Degraded media node to an Attachment. In ADF a media node
  carries a Media Services UUID and usually an `alt` filename, never the REST
  Attachment id, and a filename need not be unique on an issue. Any link ergon
  drew would be a guess presented as a fact, which goes against the spirit of
  ADR 0006, so matching is left to the reader. `ergon get` is unchanged.

### Command surface

- `ergon attachments [KEY] [ID...] [--download <dir>] [--json]`.
- The first positional argument is always the key. KEY falls back to the last
  issue only when no positional arguments are given at all, as in `comments`. No
  argument's role is inferred from its shape.
- IDs select Attachments in both modes: they narrow the listing, and with
  `--download` they limit what is fetched. With no ids, every Attachment is
  selected.
- No size cap. The agent controls cost by selecting ids from the listing.

### Selection and refusal

- Ids are resolved against the issue's own Attachment list before any download
  starts. If any id is not on the issue, the run refuses, names each unknown id,
  and writes nothing.
- Selected Attachments keep Jira's order, not the order the ids were typed in.

### Paths on disk

- Each file goes to `<dir>/<id>-<name>`, where `<name>` is the Attachment's
  filename reduced to a safe basename: path separators and any leading directory
  parts are dropped, and a name that is empty or only dots after reduction is
  replaced with a fixed fallback. The id prefix alone already makes the path
  unique.
- `path` in the output is absolute.
- `<dir>` is created if missing.
- Every file is written to a temporary name in `<dir>`, then renamed into place,
  which follows the repo's atomic-write rule. An existing file at the final path
  is always overwritten.
- Downloads run one at a time, and output prints only after every selected
  Attachment has landed. Nothing prints progress.

### `--json` contract

A bare array, one object per selected Attachment, oldest first:

```json
{
  "id": "10423",
  "filename": "checkout-error.png",
  "mimeType": "image/png",
  "size": 48213,
  "created": "2026-10-02T14:11:07.000+0200",
  "author": "Jane Doe",
  "path": "/abs/dir/10423-checkout-error.png"
}
```

- `filename` is Jira's own, unsanitized. Only `path` uses the reduced name.
- `size` is in bytes. `created` passes through Jira's string unparsed.
- `author` is the display name, and Absent when profile visibility hides it, the
  same way it works for a Comment.
- `path` is present only on Attachments downloaded in this run.
- No content or thumbnail URL. Both require ergon's credentials.

### Human output

- One line per Attachment:
  `<id>  <size>  <YYYY-MM-DD HH:MM>  <author>  <filename>`, with `→ <path>`
  appended when downloaded.
- Size is rounded, in base 1024, using B, KB or MB. The exact count is in
  `--json`.
- The timestamp is sliced from Jira's string, as `comments` does, and never
  re-rendered into the terminal's timezone.
- Mime type is not shown.
- An issue with no Attachments, or with none selected, prints
  `No attachments found.`

### Modules

- **Jira client**:
  - `listAttachments(key)` reads the issue's `attachment` field and maps each
    entry through `mapAttachment`.
  - `downloadAttachment(id)` returns the bytes. The existing request helper
    parses JSON, so it needs a raw-body variant that shares its auth and error
    handling.
  - `mapAttachment` is exported for tests, as `mapComment` is.
- **Attachments command**:
  - Registers the command.
  - Exports `selectAttachments(attachments, ids, dir?)` and
    `renderAttachments(rows)`.
  - Owns the download loop and the atomic write.
- **Types**: an `Attachment` type for the contract.

## Testing Decisions

- Tests exercise behavior through three pure seams. They never stub `fetch` or
  touch the filesystem, which matches the existing suite. (Review added a
  fourth; see Outcome.)
- **`mapAttachment`**: a full payload maps to the contract. A hidden author
  makes `author` Absent, not `null` or empty. `path` is never set by the mapper.
- **`selectAttachments`**, the new seam that carries most of the decisions:
  - No ids selects everything, in Jira's order.
  - Ids narrow the selection and keep Jira's order, whatever order they were
    typed in.
  - One or more unknown ids produce a refusal that names each of them, and no
    rows.
  - With a dir, each row gets the absolute `<dir>/<id>-<name>` path. Without
    one, no row has a path.
  - Sanitizing covers `a/b.png`, `../../etc/passwd`, a backslash name, an empty
    name and `..`. Every result stays inside `<dir>`.
  - Duplicate filenames give distinct paths.
- **`renderAttachments`**:
  - The line layout and the filename-last rule, including a filename with
    spaces.
  - Size rounding at the B/KB/MB boundaries.
  - The timestamp slice keeps Jira's own offset time.
  - The `→ path` suffix appears only on downloaded rows.
  - `No attachments found.` for an empty list.
  - A row without an author still renders.
- Prior art: the `mapComment` and `renderThread` tests in `comments_test`, the
  `renderRemoval` tests in `unlog_test`, and the Absent tests in `issues_test`.
  Use fixed timestamps.
- The IO path (the real download, temp file, rename, directory creation) is
  checked by hand against a real issue with an image, a duplicate filename and a
  large file.

## Out of Scope

- Linking Degraded media nodes in a Description or Comment to Attachment ids,
  whether by filename guess or through Media Services.
- Improving what `ergon get` prints for a media node with no `alt`.
- Printing an Attachment's content to stdout.
- Uploading, replacing or removing Attachments.
- Selecting by filename.
- A size cap, a skip-if-present mode, progress output, and parallel downloads.
- Attachments on Comments as a separate concept. Jira stores them all on the
  issue, so they appear in the same list.

## Further Notes

- **Redirect to verify first.** Jira's attachment content endpoint answers with
  a redirect to a different host (Atlassian's media service), carrying its own
  short-lived token. Fetch drops the `Authorization` header on cross-origin
  redirects, which should be harmless if the redirect target needs no Basic
  auth. Confirm this against a real issue before building on it. If the redirect
  does need handling, keep it inside the client's raw request variant.
- This adds a command and a `--json` contract. Per `AGENTS.md`, the `jira` skill
  should learn about `ergon attachments` once it ships, especially the
  list-then-download-by-id flow and the filename match against Degraded
  Descriptions.
- Update `CHANGELOG.md`, `README.md` and `NOTES.md` when implementing.

## Outcome

Implemented in `38ada5d` (listing), `b1a8599` (narrowing by id) and `a29cc1e`
(download). After code review, `4227110`, `d8ca6c7`, `42d7b08`, `cbdcafd`,
`d056f6d` and `c12b849` fixed what it raised. 263 tests pass, and
`deno task check` is clean.

### Done differently

- **The download loop is tested.** Testing Decisions planned three pure seams
  and a hand check for the IO. Review cited AGENTS.md ("use temp directories for
  filesystem tests") and the loop gained a fourth seam,
  `downloadAttachments(downloads, fetchBytes)`. It takes rows typed to carry a
  `path` and an injected downloader, and its tests run in a temp directory.
  `fetch` is still never stubbed.
- **Names are also shortened and stripped of control characters.** `<id>-<name>`
  is held to 200 UTF-8 bytes, keeping the extension and never splitting a
  character. Control characters are removed. Both went beyond the spec's
  sanitizing rule after review found that an over-long name or a NUL stopped the
  whole run partway through.
- **`--download ""` is refused by cliffy** while it parses the command line, so
  ergon needs no guard of its own. A test pins this.
- **The timestamp slice** moved to its own module, shared by `comments` and
  `attachments`, instead of `attachments` importing it from `comments`.

### Redirect

Jira's content endpoint answers `303` to Atlassian's media host, with a token in
the URL, so fetch dropping `Authorization` on that hop does no harm. NOTES.md
has the details.

### Still standing

- The plain listing prints Jira's raw `filename`, so a name holding control
  characters can still put escape sequences on the terminal. Only the path on
  disk is cleaned. This risk is accepted: the Jira is company-controlled, so a
  hostile filename is not expected.
- `mapComment` still maps a hidden author to `""`. **Absent** was widened to
  cover what Jira withholds and what a run did not produce, so the Attachment's
  hidden author and missing `path` follow the glossary, and the Comment is now
  the one out of line.
- `mapAttachment` defaults fields Jira omits (`size ?? 0` and the like) instead
  of reporting them Absent.
- A download holds the whole file in memory. Streaming would only matter for
  very large Attachments.
