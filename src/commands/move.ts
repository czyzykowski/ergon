import type { Command } from "cliffy/command/mod.ts";
import { Select } from "cliffy/prompt/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import { loadState } from "../state.ts";

export function registerMoveCommand(program: Command): void {
  program
    .command("move [issueKey:string]")
    .description("Transition a Jira issue to a new status.")
    .option("--to <status:string>", "Target status name")
    .action(async (options, issueKey?: string) => {
      const config = await loadConfig();
      const state = await loadState();
      const key = issueKey ?? state.lastIssueKey;

      if (!key) {
        throw new Error("Provide an issue key or run from a previous issue.");
      }

      const jira = new JiraClient(config.jira, config.defaults?.projects);
      const transitions = await jira.getTransitions(key);

      let transition;

      if (options.to) {
        const target = options.to as string;
        transition = transitions.find(
          (t) => t.name.toLowerCase() === target.toLowerCase(),
        );

        if (!transition) {
          throw new Error(
            `No transition found for '${target}'. Available: ${
              transitions.map((t) => t.name).join(", ")
            }`,
          );
        }
      } else {
        const selectedId = await Select.prompt({
          message: "Transition to",
          options: transitions.map((t) => ({ name: t.name, value: t.id })),
        });

        transition = transitions.find((t) => t.id === selectedId);
      }

      await jira.transitionIssue(key, transition!.id);
      console.log(`Moved ${key} to ${transition!.name}`);
    });
}
