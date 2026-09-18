import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";

interface LabelsOptions {
  filter?: string;
  json?: boolean;
}

export function registerLabelsCommand(program: Command): void {
  program
    .command("labels")
    .description("List available Jira labels.")
    .option(
      "--filter <filter:string>",
      "Only labels containing this substring (case-insensitive)",
    )
    .option("--json", "Output raw JSON")
    .action(async (options: LabelsOptions) => {
      const config = await loadConfig();
      const jira = new JiraClient(config.jira, config.defaults?.projects);
      const labels = await jira.listLabels();

      const filter = options.filter?.toLowerCase();
      const filtered = filter
        ? labels.filter((label) => label.toLowerCase().includes(filter))
        : labels;

      if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
        return;
      }

      if (filtered.length === 0) {
        console.log("No labels found.");
        return;
      }

      for (const label of filtered) {
        console.log(label);
      }
    });
}
