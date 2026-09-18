import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig, requireDeclaredProject } from "../config.ts";
import { isDate } from "../dates.ts";

export interface LsOptions {
  sprint?: boolean;
  project?: string;
  blocked?: boolean;
  inProgress?: boolean;
  limit: number;
  all?: boolean;
  json?: boolean;
  order?: string;
  since?: string;
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
    .option(
      "--order <order:string>",
      "Ordering: 'updated' (default) or 'rank', the board's own order",
    )
    .option(
      "--since <since:string>",
      "Only issues updated on or after a date (YYYY-MM-DD)",
    )
    .option("--json", "Output raw JSON")
    .option("--limit <limit:number>", "Max results", { default: 20 })
    .action(async (options: LsOptions) => {
      const config = await loadConfig();

      // Naming a project asserts ergon is configured for it; merely
      // encountering one in a cross-project sweep asserts nothing.
      if (options.project) {
        requireDeclaredProject(config.defaults?.projects, options.project);
      }

      const jira = new JiraClient(config.jira, config.defaults?.projects);
      const jql = buildJql(options);
      const issues = await jira.search(jql, options.limit);

      if (options.json) {
        console.log(JSON.stringify(issues, null, 2));
        return;
      }

      if (issues.length === 0) {
        console.log("No issues found.");
        return;
      }

      for (const issue of issues) {
        console.log(`${issue.key} [${issue.status}] ${issue.summary}`);
      }
    });
}

/**
 * The query the flags add up to. Pure, and exported for that reason: ordering
 * and scoping are rules worth checking without live Jira.
 */
export function buildJql(options: LsOptions): string {
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

  if (options.since) {
    if (!isDate(options.since)) {
      // JQL rejects an ISO-8601 instant outright, and a bare date-time is read
      // in the Jira user's timezone, which ergon does not hold.
      throw new Error("--since must be a date in YYYY-MM-DD format.");
    }

    clauses.push(`updated >= "${options.since}"`);
  }

  return `${clauses.join(" AND ")} ${orderBy(options)}`;
}

/**
 * A Rank is meaningful only within a board, so ordering by it across projects
 * produces an order nobody chose — see docs/adr/0009.
 */
function orderBy(options: LsOptions): string {
  if (options.order === undefined || options.order === "updated") {
    return "ORDER BY updated DESC";
  }

  if (options.order === "rank") {
    if (!options.project) {
      throw new Error(
        "--order rank needs one project's board; pass --project.",
      );
    }

    return "ORDER BY Rank ASC";
  }

  throw new Error(`Unknown --order ${options.order}; use rank or updated.`);
}
