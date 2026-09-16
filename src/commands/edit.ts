import type { Command } from "cliffy/command/mod.ts";
import { fromAdf, toAdf } from "../adf.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import { editInBuffer } from "../editor.ts";
import { assertRewritable } from "../rewrite.ts";
import { loadState } from "../state.ts";

interface EditOptions {
  summary?: string;
  description?: string;
  force?: boolean;
}

export function registerEditCommand(program: Command): void {
  program
    .command("edit [issueKey:string]")
    .description("Edit a Jira issue's description or summary.")
    .option("--summary <summary:string>", "New summary")
    .option(
      "--description <description:string>",
      "New description, or '-' to read it from stdin",
    )
    .option("--force", "Overwrite a description ergon cannot round-trip")
    .action(async (options: EditOptions, issueKey?: string) => {
      const config = await loadConfig();
      const state = await loadState();
      const key = issueKey ?? state.lastIssueKey;

      if (!key) {
        throw new Error("Provide an issue key or run from a previous issue.");
      }

      const supplied = options.description !== undefined;

      // --force means "flatten this deliberately", which only makes sense when
      // the replacement was written by hand. See ADR 0003.
      if (options.force && !supplied) {
        throw new Error("--force applies only to --description.");
      }

      const jira = new JiraClient(config.jira);
      const current = await jira.getIssueFields(key, ["description"]);
      const currentAdf = current.description;
      assertRewritable({
        subject: `${key}'s description`,
        doc: currentAdf,
        supplied,
        force: options.force === true,
        flag: "--description",
      });

      const description = supplied
        ? await resolveDescription(options.description as string)
        : await editInBuffer({
          subject: key,
          current: fromAdf(currentAdf),
          missingEditor:
            "Set $EDITOR (or $VISUAL) to edit a description, or pass --description.",
        });

      const fields: Record<string, unknown> = {};
      const changed: string[] = [];

      if (description !== undefined) {
        fields.description = toAdfField(description);
        changed.push("description");
      }

      if (options.summary !== undefined) {
        fields.summary = options.summary;
        changed.push("summary");
      }

      if (changed.length === 0) {
        console.log(`No changes for ${key}`);
        return;
      }

      await jira.updateIssue(key, fields);
      console.log(`Updated ${key} (${changed.join(", ")})`);
    });
}

/** `-` means the body is on stdin; anything else is the body itself. */
async function resolveDescription(value: string): Promise<string> {
  if (value !== "-") return value;

  return await new Response(Deno.stdin.readable).text();
}

/**
 * Jira clears a rich-text field with null rather than an empty document, so an
 * empty description has to be sent as null.
 */
function toAdfField(text: string): unknown {
  return text.length === 0 ? null : toAdf(text);
}
