import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";

interface LabelsOptions {
  filter?: string;
}

export function registerLabelsCommand(program: Command): void {
  program
    .command("labels")
    .description("List available Jira labels.")
    .option(
      "--filter <filter:string>",
      "Only labels containing this substring (case-insensitive)",
    )
    .action(async (options: LabelsOptions) => {
      const config = await loadConfig();
      const jira = new JiraClient(config.jira);
      const labels = await jira.listLabels();

      const filter = options.filter?.toLowerCase();
      const filtered = filter
        ? labels.filter((label) => label.toLowerCase().includes(filter))
        : labels;

      if (filtered.length === 0) {
        console.log("No labels found.");
        return;
      }

      for (const label of filtered) {
        console.log(label);
      }
    });
}
