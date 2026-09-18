import type { Command } from "cliffy/command/mod.ts";
import { formatDuration } from "../api/clockwork.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import { isDate, today } from "../dates.ts";
import type { Worklog } from "../types.ts";
import { readDay, totalSeconds } from "../worklogs.ts";

interface WorklogsOptions {
  date?: string;
  json?: boolean;
}

export function registerWorklogsCommand(program: Command): void {
  program
    .command("worklogs")
    .description("Show a day's logged time, broken down by issue.")
    .option("--date <date:string>", "Day to read, in YYYY-MM-DD format")
    .option("--json", "Output raw JSON")
    .action(async (options: WorklogsOptions) => {
      const date = options.date ?? today();

      if (!isDate(date)) {
        throw new Error("--date must be a date in YYYY-MM-DD format.");
      }

      const config = await loadConfig();
      const jira = new JiraClient(config.jira, config.defaults?.projects);
      const worklogs = await readDay(jira, date);

      if (options.json) {
        console.log(JSON.stringify(worklogs, null, 2));
        return;
      }

      console.log(renderWorklogs(worklogs));
    });
}

/**
 * The day as it reads in a terminal: one line per Worklog, because two blocks
 * on the same ticket at different times of day are two facts, and a total,
 * because "and how much is that" always follows.
 */
export function renderWorklogs(worklogs: readonly Worklog[]): string {
  if (worklogs.length === 0) return "No worklogs found.";

  const durations = worklogs.map((entry) =>
    formatDuration(entry.timeSpentSeconds)
  );
  const keyWidth = widest(worklogs.map((entry) => entry.issueKey));
  const durationWidth = widest(durations);

  const lines = worklogs.map((entry, index) =>
    [
      entry.issueKey.padEnd(keyWidth),
      startTime(entry.started),
      durations[index].padEnd(durationWidth),
      entry.description ?? "",
    ].join("  ").trimEnd()
  );

  return [...lines, "", `Total: ${formatDuration(totalSeconds(worklogs))}`]
    .join("\n");
}

function widest(values: readonly string[]): number {
  return values.reduce((width, value) => Math.max(width, value.length), 0);
}

/**
 * `HH:MM`, sliced out of Jira's own string rather than parsed, the way
 * `ergon comments` reads a timestamp: it already carries the offset it was
 * written at.
 */
function startTime(started: string): string {
  return started.slice(11, 16);
}
