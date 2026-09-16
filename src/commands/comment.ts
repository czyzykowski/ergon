import type { Command } from "cliffy/command/mod.ts";
import { toAdf } from "../adf.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import { editInBuffer } from "../editor.ts";
import { loadState } from "../state.ts";

interface CommentOptions {
  body?: string;
  force?: boolean;
  json?: boolean;
}

export function registerCommentCommand(program: Command): void {
  program
    .command("comment [issueKey:string]")
    .description("Add a comment to a Jira issue.")
    .option(
      "--body <body:string>",
      "The comment, or '-' to read it from stdin",
    )
    .option("--force", "Overwrite a comment ergon cannot round-trip")
    .option("--json", "Output raw JSON")
    .action(async (options: CommentOptions, issueKey?: string) => {
      const config = await loadConfig();
      const state = await loadState();
      const key = issueKey ?? state.lastIssueKey;

      if (!key) {
        throw new Error("Provide an issue key or run from a previous issue.");
      }

      // Adding has nothing to destroy, so --force would be a no-op. A flag
      // meaning "destroy this deliberately" is the wrong one to ignore.
      if (options.force) {
        throw new Error("--force applies only to editing a comment with --id.");
      }

      const body = await resolveBody(key, options.body);

      if (body === undefined) {
        console.log(`No comment added to ${key}`);
        return;
      }

      const jira = new JiraClient(config.jira);
      const comment = await jira.addComment(key, toAdf(body));

      if (options.json) {
        console.log(JSON.stringify(comment, null, 2));
        return;
      }

      console.log(`Added comment ${comment.id} to ${key}`);
    });
}

/**
 * The Comment to post, or undefined when the operator wrote nothing. `-` means
 * stdin; with no `--body` at all the editor opens on an empty buffer.
 *
 * An empty body is refused rather than treated as a clear, which is where the
 * `ergon edit --description ""` analogy deliberately stops: a Description can
 * be blank, a Comment cannot.
 */
async function resolveBody(
  key: string,
  supplied: string | undefined,
): Promise<string | undefined> {
  if (supplied === undefined) {
    return await editInBuffer({
      subject: `${key}-comment`,
      current: "",
      missingEditor:
        "Set $EDITOR (or $VISUAL) to write a comment, or pass --body.",
    });
  }

  const body = supplied === "-"
    ? await new Response(Deno.stdin.readable).text()
    : supplied;

  if (body.trim().length === 0) {
    throw new Error("A comment needs a body.");
  }

  return body;
}
