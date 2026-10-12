import type { Command } from "cliffy/command/mod.ts";
import { JiraClient, mapIssue } from "../api/jira.ts";
import { boardForScope, listInBoardOrder } from "../board_order.ts";
import { loadConfig, requireDeclaredProject } from "../config.ts";
import { isDate } from "../dates.ts";
import type { JiraIssue } from "../types.ts";

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
      "Ordering: 'updated' (default) or 'board', the order the board shows",
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
      const issues = await listIssues(jira, options);

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

async function listIssues(
  jira: JiraClient,
  options: LsOptions,
): Promise<JiraIssue[]> {
  if (listOrder(options) === "updated") {
    return await jira.search(buildJql(options), options.limit);
  }

  // Board order is only known once the whole board is in hand, so the limit
  // applies to the ordered list rather than to the fetch.
  const ordered = await listInBoardOrder({
    jira,
    boardId: boardForScope(jira.projects, options.project),
    clauses: filterClauses(options),
    projects: jira.projects,
  });

  return ordered.slice(0, options.limit).map((issue) =>
    mapIssue(issue, jira.projects)
  );
}

/**
 * The query the flags add up to, in `updated` order. Pure, and exported for
 * that reason: ordering and scoping are rules worth checking without live Jira.
 */
export function buildJql(options: LsOptions): string {
  listOrder(options);

  return `${filterClauses(options).join(" AND ")} ORDER BY updated DESC`;
}

/**
 * What the flags narrow the list to, whatever the ordering. Finished work is
 * told apart by status category: the workflows ergon serves never set a
 * resolution, so `resolution = Unresolved` matches every issue ever closed.
 */
export function filterClauses(options: LsOptions): string[] {
  const clauses: string[] = [];

  if (options.project) {
    clauses.push(`project = ${options.project}`);
  }

  if (options.sprint) {
    clauses.push("sprint in openSprints()");
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
    clauses.push("statusCategory != Done");
  }

  if (options.since) {
    if (!isDate(options.since)) {
      // JQL rejects an ISO-8601 instant outright, and a bare date-time is read
      // in the Jira user's timezone, which ergon does not hold.
      throw new Error("--since must be a date in YYYY-MM-DD format.");
    }

    clauses.push(`updated >= "${options.since}"`);
  }

  return clauses;
}

/**
 * The ordering asked for. Raw Rank is not offered: it interleaves Sprints with
 * the backlog, which is not the order any board shows — see docs/adr/0013.
 */
export function listOrder(options: LsOptions): "updated" | "board" {
  if (options.order === undefined || options.order === "updated") {
    return "updated";
  }

  if (options.order === "board") {
    return "board";
  }

  if (options.order === "rank") {
    throw new Error(
      "--order rank is gone; use --order board, the order the board shows.",
    );
  }

  throw new Error(`Unknown --order ${options.order}; use board or updated.`);
}
