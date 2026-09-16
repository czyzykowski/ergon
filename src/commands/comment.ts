import type { Command } from "cliffy/command/mod.ts";
import { fromAdf, toAdf } from "../adf.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import { editInBuffer } from "../editor.ts";
import { assertRewritable } from "../rewrite.ts";
import { loadState } from "../state.ts";
import type { JiraComment } from "../types.ts";

interface CommentOptions {
  body?: string;
  id?: string;
  force?: boolean;
  json?: boolean;
}

export function registerCommentCommand(program: Command): void {
  program
    .command("comment [issueKey:string]")
    .description("Add a comment to a Jira issue, or edit an existing one.")
    .option(
      "--body <body:string>",
      "The comment, or '-' to read it from stdin",
    )
    .option("--id <id:string>", "Edit the comment with this id")
    .option("--force", "Overwrite a comment ergon cannot round-trip")
    .option("--json", "Output raw JSON")
    .action(async (options: CommentOptions, issueKey?: string) => {
      const config = await loadConfig();
      const state = await loadState();
      const key = issueKey ?? state.lastIssueKey;

      if (!key) {
        throw new Error("Provide an issue key or run from a previous issue.");
      }

      const supplied = options.body !== undefined;

      // --force means "flatten this deliberately", which is legal in exactly
      // one combination: replacing an existing Comment with a body written by
      // hand. Both other uses are mistakes rather than no-ops. See ADR 0003.
      if (options.force && options.id === undefined) {
        throw new Error("--force applies only to editing a comment with --id.");
      }

      if (options.force && !supplied) {
        throw new Error(
          "--force is not available on the editor path; pass --body to " +
            "replace the comment outright.",
        );
      }

      const jira = new JiraClient(config.jira);
      const comment = options.id === undefined
        ? await addComment(jira, key, options)
        : await editComment(jira, key, options.id, options);

      if (comment === undefined) return;

      if (options.json) {
        console.log(JSON.stringify(comment, null, 2));
        return;
      }

      console.log(
        options.id === undefined
          ? `Added comment ${comment.id} to ${key}`
          : updateReceipt(comment, key),
      );
    });
}

async function addComment(
  jira: JiraClient,
  key: string,
  options: CommentOptions,
): Promise<JiraComment | undefined> {
  const body = await resolveBody(options.body, {
    subject: `${key}-comment`,
    current: "",
    missingEditor:
      "Set $EDITOR (or $VISUAL) to write a comment, or pass --body.",
  });

  if (body === undefined) {
    console.log(`No comment added to ${key}`);
    return undefined;
  }

  return await jira.addComment(key, toAdf(body));
}

/**
 * Replacing a Comment destroys whatever ergon could not reproduce in the
 * buffer, so the Comment is read first and the write refused when it holds
 * anything richer than paragraphs — the same guard `ergon edit` gives a
 * Description, for the same reason: Jira keeps no field-level undo.
 *
 * An `--id` from another issue is left to Jira, which 404s on the mismatch.
 */
async function editComment(
  jira: JiraClient,
  key: string,
  id: string,
  options: CommentOptions,
): Promise<JiraComment | undefined> {
  const current = await jira.getComment(key, id);
  assertRewritable({
    subject: `Comment ${id} on ${key}`,
    doc: current.body,
    supplied: options.body !== undefined,
    force: options.force === true,
    flag: "--body",
  });

  const body = await resolveBody(options.body, {
    subject: `${key}-comment-${id}`,
    current: fromAdf(current.body),
    missingEditor:
      "Set $EDITOR (or $VISUAL) to edit a comment, or pass --body.",
  });

  if (body === undefined) {
    console.log(`No changes to comment ${id} on ${key}`);
    return undefined;
  }

  return await jira.updateComment({
    issueKey: key,
    commentId: id,
    body: toAdf(body),
    visibility: current.visibility,
  });
}

/**
 * The Comment to write, or undefined when the operator wrote nothing. `-` means
 * stdin; with no `--body` at all the editor opens on `buffer`.
 */
async function resolveBody(
  supplied: string | undefined,
  buffer: { subject: string; current: string; missingEditor: string },
): Promise<string | undefined> {
  if (supplied === undefined) {
    const edited = await editInBuffer(buffer);

    return edited === undefined ? undefined : refuseBlank(edited);
  }

  const body = supplied === "-"
    ? await new Response(Deno.stdin.readable).text()
    : supplied;

  return refuseBlank(body);
}

/**
 * An empty body is refused rather than treated as a clear, which is where the
 * `ergon edit --description ""` analogy deliberately stops: a Description can
 * be blank, a Comment cannot. An untouched editor buffer is a different thing —
 * it never reaches here, and means "changed my mind".
 */
function refuseBlank(body: string): string {
  if (body.trim().length === 0) {
    throw new Error("A comment needs a body.");
  }

  return body;
}

/**
 * Names a restriction when the Comment carries one, so that preserving it
 * through an edit is not silent. Adding never produces one — ergon does not
 * author restrictions.
 */
function updateReceipt(comment: JiraComment, key: string): string {
  const line = `Updated comment ${comment.id} on ${key}`;

  return comment.visibility
    ? `${line} (restricted: ${comment.visibility.type} ${comment.visibility.value})`
    : line;
}
