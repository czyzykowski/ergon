import type { Command } from "cliffy/command/mod.ts";
import { fromAdf, toAdf } from "../adf.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import { editInBuffer } from "../editor.ts";
import { assertRewritable } from "../rewrite.ts";
import { requireSprintFieldId, resolveSprintId } from "../sprint.ts";
import { loadState } from "../state.ts";
import type { ProjectFieldDefaults } from "../types.ts";
import type { EditOptions, SprintTarget } from "./edit_fields.ts";
import { planEdit } from "./edit_fields.ts";

export function registerEditCommand(program: Command): void {
  program
    .command("edit [issueKey:string]")
    .description("Edit a Jira issue's fields.")
    .option("--summary <summary:string>", "New summary")
    .option(
      "--description <description:string>",
      "New description, or '-' to read it from stdin",
    )
    .option(
      "--due <due:string>",
      "Due date in YYYY-MM-DD format, or 'none' to clear it",
    )
    .option(
      "--sprint <sprint:string>",
      "Sprint name or id; 'current' for the board's active sprint, 'none' to clear it",
    )
    .option("--force", "Overwrite a description ergon cannot round-trip")
    .action(async (options: EditOptions, issueKey?: string) => {
      const config = await loadConfig();
      const state = await loadState();
      const key = issueKey ?? state.lastIssueKey;

      if (!key) {
        throw new Error("Provide an issue key or run from a previous issue.");
      }

      const plan = planEdit(options);
      const jira = new JiraClient(config.jira, config.defaults?.projects);

      // Only what this invocation actually needs: a write that does not touch
      // the Description does not consult it.
      const wanted: string[] = [];
      if (plan.fetchesDescription) wanted.push("description");
      if (plan.writes.some((write) => write.field === "sprint")) {
        wanted.push("project");
      }

      const current = wanted.length > 0
        ? await jira.getIssueFields(key, wanted)
        : {};

      if (plan.fetchesDescription) {
        assertRewritable({
          subject: `${key}'s description`,
          doc: current.description,
          supplied: options.description !== undefined,
          force: options.force === true,
          flag: "--description",
        });
      }

      const fields: Record<string, unknown> = {};
      const changed: string[] = [];

      if (plan.opensEditor) {
        const edited = await editInBuffer({
          subject: key,
          current: fromAdf(current.description),
          missingEditor:
            "Set $EDITOR (or $VISUAL) to edit a description, or pass --description.",
        });

        if (edited !== undefined) {
          fields.description = toAdfField(edited);
          changed.push("description");
        }
      }

      for (const write of plan.writes) {
        switch (write.field) {
          case "description":
            fields.description = toAdfField(
              await resolveDescription(options.description as string),
            );
            changed.push("description");
            break;
          case "summary":
            fields.summary = write.value;
            changed.push("summary");
            break;
          case "due":
            fields.duedate = write.value;
            changed.push("due");
            break;
          case "sprint": {
            // `edit` names an issue rather than a project, so the project — and
            // with it the field to write — comes from the issue itself.
            const projectKey = projectKeyOf(current.project, key);
            const fieldDefaults = config.defaults?.projects?.[projectKey]
              ?.fields;

            fields[
              requireSprintFieldId(fieldDefaults?.sprintFieldId, projectKey)
            ] = await resolveSprint(
              jira,
              fieldDefaults,
              projectKey,
              write.target,
            );
            changed.push("sprint");
            break;
          }
        }
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

function projectKeyOf(project: unknown, issueKey: string): string {
  const key = (project as { key?: string } | undefined)?.key;

  if (!key) {
    throw new Error(`Could not read the project ${issueKey} belongs to.`);
  }

  return key;
}

/** The sprint id to write, or null to take the issue out of its Sprint. */
async function resolveSprint(
  jira: JiraClient,
  fieldDefaults: ProjectFieldDefaults | undefined,
  projectKey: string,
  target: SprintTarget,
): Promise<number | null> {
  if (target.kind === "none") return null;
  if (target.kind === "id") return target.id;

  return await resolveSprintId({
    jira,
    boards: await jira.listBoards(projectKey),
    configuredBoardId: fieldDefaults?.sprintBoardId,
    name: target.kind === "name" ? target.name : undefined,
  });
}
