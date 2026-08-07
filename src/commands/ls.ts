import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";

interface LsOptions {
  sprint?: boolean;
  project?: string;
  blocked?: boolean;
  inProgress?: boolean;
  limit: number;
  all?: boolean;
}

export function registerLsCommand(program: Command): void {
  program
    .command("ls")
    .description("List Jira issues.")
    .option("--sprint", "Filter to current sprint")
    .option("--project <project:string>", "Filter by project key")
    .option("--blocked", "Only blocked issues")
    .option("--in-progress", "Only in-progress issues")
    .option("--all", "Include issues not assigned to you")
    .option("--limit <limit:number>", "Max results", { default: 20 })
    .action(async (options: LsOptions) => {
      const config = await loadConfig();
      const jira = new JiraClient(config.jira);
      const jql = buildJql(options);
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

function buildJql(options: LsOptions): string {
  const clauses: string[] = [];

  if (options.project) {
    clauses.push(`project = ${options.project}`);
  }

  if (options.sprint) {
    clauses.push("sprint in openSprints() and resolution = Unresolved");
  }

  if (options.inProgress) {
    clauses.push('statusCategory = "In Progress"');
    clauses.push(
      'status not in ("Ready for QA", "Ready for UAT", "UAT", "QA", "Blocked")',
    );
  }

  if (options.blocked) {
    clauses.push("status = Blocked");
  }

  if (!options.all) {
    clauses.push("assignee = currentUser()");
  }

  if (clauses.length === 0) {
    clauses.push("resolution = Unresolved");
  }

  return `${clauses.join(" AND ")} ORDER BY updated DESC`;
}
