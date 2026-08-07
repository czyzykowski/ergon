import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";

interface SearchOptions {
  project?: string;
  status?: string;
  limit: number;
}

export function registerSearchCommand(program: Command): void {
  program
    .command("search <query:string>")
    .description("Search Jira issues by text.")
    .option("--project <project:string>", "Filter by project key")
    .option("--status <status:string>", "Comma-separated statuses")
    .option("--limit <limit:number>", "Max results", { default: 20 })
    .action(async (options: SearchOptions, query: string) => {
      const config = await loadConfig();
      const jira = new JiraClient(config.jira);
      const jql = buildJql(query, options.project, options.status);
      const issues = await jira.search(jql, options.limit);

      if (issues.length === 0) {
        console.log("No issues found.");
        return;
      }

      for (const issue of issues) {
        console.log(`${issue.key} [${issue.status}] ${issue.summary}`);
      }
    });
}

function buildJql(query: string, project?: string, status?: string): string {
  const clauses = [
    `text ~ "${query.replace(/"/g, '\\"')}"`,
  ];

  if (project) {
    clauses.push(`project = ${project}`);
  }

  if (status) {
    const statuses = status
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (statuses.length > 0) {
      const list = statuses.map((value) => `"${value}"`).join(", ");
      clauses.push(`status in (${list})`);
    }
  }

  return `${clauses.join(" AND ")} ORDER BY updated DESC`;
}
