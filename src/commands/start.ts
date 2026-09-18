import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { ClockworkClient } from "../api/clockwork.ts";
import { loadConfig } from "../config.ts";
import { loadState, saveState } from "../state.ts";

export function registerStartCommand(program: Command): void {
  program
    .command("start [issueKey:string]")
    .description("Start a timer for an issue.")
    .action(async (_options, issueKey?: string) => {
      const config = await loadConfig();
      const state = await loadState();
      const key = issueKey ?? state.lastIssueKey;

      if (!key) {
        throw new Error("Provide an issue key or run from a previous issue.");
      }

      const jira = new JiraClient(config.jira, config.defaults?.projects);
      const clockwork = new ClockworkClient(config.clockwork, {
        timerBaseUrl: config.clockwork.timerBaseUrl,
      });

      const issue = await jira.getIssue(key);
      const timer = await clockwork.startTimer(issue.key);

      await saveState({
        ...state,
        lastIssueKey: issue.key,
        lastProject: issue.projectKey || state.lastProject,
        timer: {
          issueKey: issue.key,
          startedAt: timer.startedAt ?? new Date().toISOString(),
          summary: issue.summary,
        },
      });

      console.log(`Started timer for ${issue.key}: ${issue.summary}`);
    });
}
