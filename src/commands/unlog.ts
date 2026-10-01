import type { Command } from "cliffy/command/mod.ts";
import { formatDuration } from "../api/clockwork.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import type { Worklog } from "../types.ts";
import { removeWorklog, startStamp } from "../worklogs.ts";

export function registerUnlogCommand(program: Command): void {
  program
    .command("unlog <issueKey:string> <worklogId:string>")
    .description("Remove a worklog, by the id `ergon worklogs` prints.")
    .action(async (_options: unknown, issueKey: string, worklogId: string) => {
      const config = await loadConfig();
      const jira = new JiraClient(config.jira, config.defaults?.projects);

      console.log(
        renderRemoval(await removeWorklog(jira, issueKey, worklogId)),
      );
    });
}

/**
 * The receipt, which is the only record of what was removed: Jira cannot
 * restore a Worklog, so this line is what a re-log is typed from. Duration
 * first because it is what the correction is about, description last because it
 * is the only variable-length part, and the start carries its date because
 * `ergon log` would otherwise default the re-log to today.
 */
export function renderRemoval(worklog: Worklog): string {
  const head = `Removed ${
    formatDuration(worklog.timeSpentSeconds)
  } on ${worklog.issueKey} at ${startStamp(worklog.started)} (${worklog.id})`;

  const tail = worklog.descriptionDegraded.length > 0
    ? ` (degraded: ${worklog.descriptionDegraded.join(", ")})`
    : "";

  return worklog.description === null
    ? `${head}${tail}`
    : `${head}: ${worklog.description}${tail}`;
}
