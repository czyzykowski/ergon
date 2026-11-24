import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../../api/jira.ts";
import { loadConfig } from "../../config.ts";
import { parseAssignee } from "../../flags.ts";
import { isInteractive } from "../../interactive.ts";
import { loadState, saveState } from "../../state.ts";
import {
  assertExpressible,
  planSource,
  readSource,
} from "../../text_source.ts";
import { fileNewIssue } from "./issue.ts";
import { cliffyPrompter, nonInteractivePrompter } from "./prompter.ts";

export interface NewOptions {
  project?: string;
  epic?: string;
  parent?: string;
  type?: string;
  summary?: string;
  description?: string;
  descriptionFile?: string;
  clientSow?: string;
  labels?: string;
  sprint?: string;
  assignee?: string;
  // cliffy turns --no-cache into `cache: false`, and leaves it true otherwise.
  cache?: boolean;
  nonInteractive?: boolean;
}

/** Whether a run reads and saves the Cache, from its parsed flags. */
export function usesCache(options: NewOptions): boolean {
  return options.cache !== false;
}

export function registerNewCommand(program: Command): void {
  program
    .command("new [summary:string]")
    .description("Create a new Jira issue.")
    .option("--project <project:string>", "Project key")
    .option("--epic <epic:string>", "Epic key")
    .option("--parent <parent:string>", "Parent issue key")
    .option("--type <type:string>", "Issue type", { default: "Task" })
    .option("--summary <summary:string>", "Issue summary")
    .option(
      "--description <description:string>",
      "Issue description, or '-' to read it from stdin",
    )
    .option(
      "--description-file <descriptionFile:string>",
      "Read the issue description from this file, or from stdin for '-'",
    )
    .option("--client-sow <clientSow:string>", "Client SOW")
    .option(
      "--labels <labels:string>",
      "Labels (comma separated); 'none' to create the issue unlabelled",
    )
    .option(
      "--sprint <sprint:string>",
      "Sprint id, or an active sprint's name ('ergon sprints <project>' lists them); 'active' for the active sprint, 'none' to skip",
    )
    .option(
      "--assignee <assignee:string>",
      "'me' to assign the issue to yourself, 'none' to create it unassigned; left out, the project's default applies",
    )
    .option("--no-cache", "Disable cached Jira metadata")
    .option(
      "--non-interactive",
      "Never prompt, as every run without a terminal already is. Client SOW and labels are inherited from the parent (or the epic), then from project config; remembered state is ignored. Use 'none' as a value to explicitly clear --epic/--labels/--client-sow/--sprint.",
    )
    .action(async (options: NewOptions, summaryArg?: string) => {
      const config = await loadConfig();
      const state = await loadState();
      const interactive = isInteractive(options);

      // Settled and read before the first prompt and the first Jira call: a
      // typo'd path, an empty file or a construct ergon cannot write costs an
      // error rather than six answered prompts and two round-trips.
      const subject = "Description";
      const descriptionSource = planSource({
        inline: options.description,
        file: options.descriptionFile,
        flag: "--description",
        fileFlag: "--description-file",
        subject,
        interactive,
      });
      let description: string | undefined;

      if (descriptionSource) {
        description = await readSource(descriptionSource, { subject });
        assertExpressible(description, descriptionSource);
      }

      // Refused here for the same reason as a bad Description source.
      const assignee = options.assignee === undefined
        ? undefined
        : parseAssignee(options.assignee);

      const { issue, state: next } = await fileNewIssue({
        project: options.project,
        epic: options.epic,
        parent: options.parent,
        type: options.type,
        summary: summaryArg ?? options.summary,
        description,
        clientSow: options.clientSow,
        labels: options.labels,
        sprint: options.sprint,
        assignee,
      }, {
        config,
        state,
        interactive,
        prompter: interactive ? cliffyPrompter : nonInteractivePrompter,
        jira: new JiraClient(config.jira, config.defaults?.projects),
        useCache: usesCache(options),
      });

      await saveState(next);

      console.log(`Created ${issue.key}: ${issue.summary}`);
    });
}
