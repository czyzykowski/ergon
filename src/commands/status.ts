import type { Command } from "cliffy/command/mod.ts";
import { formatDuration } from "../api/clockwork.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import { loadState } from "../state.ts";
import { readDay, today, totalSeconds } from "../worklogs.ts";

interface StatusOutput {
  timer?: {
    issueKey: string;
    summary?: string;
    startedAt: string;
  };
  todaySeconds: number;
  todayFormatted: string;
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show current timer and today's totals.")
    .option("--json", "Output JSON")
    .action(async (options) => {
      const config = await loadConfig();
      const state = await loadState();
      const jira = new JiraClient(config.jira, config.defaults?.projects);

      // Read from Jira, which sees the Clockwork timer, `ergon log`, and the
      // Jira UI. Clockwork saw only the first — see docs/adr/0008.
      const todaySeconds = totalSeconds(await readDay(jira, today()));

      const output: StatusOutput = {
        // A running timer is Clockwork's, and is not a Worklog until it stops,
        // which is why Jira cannot report it.
        timer: state.timer,
        todaySeconds,
        todayFormatted: formatDuration(todaySeconds),
      };

      if (options.json) {
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      if (output.timer) {
        const summary = output.timer.summary?.trim();
        const label = summary ? ` ${summary}` : "";
        console.log(`Timer: ${output.timer.issueKey}${label}`);
        console.log(`Started: ${output.timer.startedAt}`);
      } else {
        console.log("Timer: none");
      }

      console.log(`Today: ${output.todayFormatted}`);
    });
}
