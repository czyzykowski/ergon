import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import { localDay } from "../dates.ts";
import type { JiraIssue } from "../types.ts";

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

      console.log(renderIssue(issue));
    });
}

/**
 * An issue as a person reads it: its fields as an indented header, then the
 * Description below a blank line. The body is the same markdown `--json`
 * carries, left unindented so it copies out with its structure intact.
 */
export function renderIssue(issue: JiraIssue): string {
  const lines = [
    `${issue.key} [${issue.status}] ${issue.summary}`,
    `  type:     ${issue.issueType}`,
    `  project:  ${issue.projectKey}`,
  ];

  if (issue.epicKey) {
    lines.push(`  epic:     ${issue.epicKey} ${issue.epicSummary ?? ""}`);
  }
  if (issue.parentKey) {
    lines.push(`  parent:   ${issue.parentKey} ${issue.parentSummary ?? ""}`);
  }
  lines.push(`  assignee: ${issue.assignee ?? "Unassigned"}`);
  if (issue.statusSince) {
    lines.push(`  since:    ${localDay(new Date(issue.statusSince))}`);
  }

  if (issue.descriptionDegraded.length > 0) {
    lines.push(`  degraded: ${issue.descriptionDegraded.join(", ")}`);
  }

  if (issue.links && issue.links.length > 0) {
    lines.push("  links:");
    for (const link of issue.links) {
      lines.push(
        `    ${link.phrase} ${link.key} [${link.status}] ${link.summary}`,
      );
    }
  }

  if (issue.description !== null) {
    lines.push("", issue.description);
  }

  return lines.join("\n");
}
