import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import { loadState } from "../state.ts";
import type { JiraComment } from "../types.ts";

interface CommentsOptions {
  json?: boolean;
}

export function registerCommentsCommand(program: Command): void {
  program
    .command("comments [issueKey:string]")
    .description("Read an issue's comments.")
    .option("--json", "Output raw JSON")
    .action(async (options: CommentsOptions, issueKey?: string) => {
      const config = await loadConfig();
      const state = await loadState();
      const key = issueKey ?? state.lastIssueKey;

      if (!key) {
        throw new Error("Provide an issue key or run from a previous issue.");
      }

      const jira = new JiraClient(config.jira, config.defaults?.projects);
      const comments = await jira.listComments(key);

      if (options.json) {
        console.log(JSON.stringify(comments, null, 2));
        return;
      }

      console.log(renderThread(comments));
    });
}

/**
 * The thread as it reads in a terminal: a header line carrying everything
 * about the Comment that is not its text, then the body indented under it.
 *
 * Bodies are printed whole. There is no command that reads one Comment, so a
 * truncated listing would leave human mode unable to read a Comment at all.
 */
export function renderThread(comments: JiraComment[]): string {
  if (comments.length === 0) return "No comments found.";

  return comments.map(renderComment).join("\n\n");
}

function renderComment(comment: JiraComment): string {
  const header = [
    `${comment.id}  ${comment.author}  ${timestamp(comment.created)}`,
  ];

  if (comment.updated !== comment.created) {
    header.push(`(edited ${timestamp(comment.updated)})`);
  }

  if (comment.bodyDegraded.length > 0) {
    header.push(`(degraded: ${comment.bodyDegraded.join(", ")})`);
  }

  return [header.join("  "), indent(comment.body)].join("\n");
}

/** Two spaces, matching how `ergon get` indents an issue's fields. */
function indent(body: string): string {
  return body
    .split("\n")
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join("\n");
}

/**
 * `YYYY-MM-DD HH:MM`, sliced out of Jira's own string rather than parsed. The
 * timestamp already carries the offset it was written at, so reading it back
 * as a Date would only re-render it in whatever zone the terminal is in.
 */
function timestamp(value: string): string {
  return `${value.slice(0, 10)} ${value.slice(11, 16)}`.trim();
}
