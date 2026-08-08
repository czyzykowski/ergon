import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";

interface ClientSowsOptions {
  json?: boolean;
}

export function registerClientSowsCommand(program: Command): void {
  program
    .command("client-sows <projectKey:string>")
    .description("List the Client SOW options a project accepts.")
    .option("--json", "Output raw JSON")
    .action(async (options: ClientSowsOptions, projectKey: string) => {
      const config = await loadConfig();
      const fieldId = config.defaults?.projects?.[projectKey]?.fields
        ?.clientSowFieldId;

      // Answering from a guessed field id would be confidently wrong for
      // exactly the projects the caller knows least about — see docs/adr/0002.
      if (!fieldId) {
        throw new Error(
          `No Client SOW field configured for ${projectKey}. Set ` +
            `defaults.projects.${projectKey}.fields.clientSowFieldId in ` +
            `~/.config/ergon/config.yaml.`,
        );
      }

      const jira = new JiraClient(config.jira);
      // Deliberately uncached: the point of the command is what Jira accepts
      // now, and the metadata cache has no expiry.
      const sows = await jira.getFieldOptions(fieldId);
      // Jira returns more per option than the field id and value; narrow it so
      // --json stays a stable contract rather than a passthrough.
      const sorted = sows
        .map((sow) => ({ id: sow.id, value: sow.value }))
        .sort((a, b) => a.value.localeCompare(b.value));

      if (options.json) {
        console.log(JSON.stringify(sorted, null, 2));
        return;
      }

      if (sorted.length === 0) {
        console.log("No Client SOW options found.");
        return;
      }

      for (const sow of sorted) {
        console.log(sow.value);
      }
    });
}
