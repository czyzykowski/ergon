import { Command } from "cliffy/command/mod.ts";
import { ClockworkClient, formatDuration } from "../api/clockwork.ts";
import { loadConfig } from "../config.ts";
import { loadState } from "../state.ts";

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
      const clockwork = new ClockworkClient(config.clockwork);
      const state = await loadState();
      const today = new Date();
      const dateLabel = today.toISOString().slice(0, 10);

      const worklogs = await clockwork.getWorklogs({
        from: dateLabel,
        to: dateLabel,
      });
      const todayWorklogs = worklogs.filter((log) => {
        if (!log.startedAt) {
          return false;
        }

        return log.startedAt.startsWith(dateLabel);
      });
      const todaySeconds = todayWorklogs.reduce((total, log) => {
        return total + (log.timeSpentSeconds ?? 0);
      }, 0);

      const output: StatusOutput = {
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
