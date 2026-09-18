import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";

interface GetOptions {
  json?: boolean;
}

export function registerGetCommand(program: Command): void {
  program
    .command("get <issueKey:string>")
    .description("Fetch a single Jira issue by key.")
    .option("--json", "Output raw JSON")
    .action(async (options: GetOptions, issueKey: string) => {
      const config = await loadConfig();
      const jira = new JiraClient(config.jira, config.defaults?.projects);
      const issue = await jira.getIssue(issueKey);

      if (options.json) {
        console.log(JSON.stringify(issue, null, 2));
        return;
      }

      console.log(`${issue.key} [${issue.status}] ${issue.summary}`);
      console.log(`  type:     ${issue.issueType}`);
      console.log(`  project:  ${issue.projectKey}`);
      if (issue.epicKey) {
        console.log(`  epic:     ${issue.epicKey} ${issue.epicSummary ?? ""}`);
      }
      if (issue.parentKey) {
        console.log(
          `  parent:   ${issue.parentKey} ${issue.parentSummary ?? ""}`,
        );
      }
      console.log(`  assignee: ${issue.assignee ?? "Unassigned"}`);

      if (issue.links && issue.links.length > 0) {
        console.log("  links:");
        for (const link of issue.links) {
          console.log(
            `    ${link.phrase} ${link.key} [${link.status}] ${link.summary}`,
          );
        }
      }
    });
}
