import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import { loadState, saveState } from "../state.ts";

interface LogOptions {
  date?: string;
  description?: string;
  time?: string;
}

export function registerLogCommand(program: Command): void {
  program
    .command("log <issueKey:string> <duration:string>")
    .description("Log time to an issue without starting a timer.")
    .option("--date <date:string>", "Start date in YYYY-MM-DD format")
    .option("--description <description:string>", "Worklog description")
    .option("--time <time:string>", "Start time (HH:MM), used with --date")
    .action(async (options: LogOptions, issueKey: string, duration: string) => {
      const config = await loadConfig();
      const jira = new JiraClient(config.jira, config.defaults?.projects);
      const state = await loadState();

      const timeSpentSeconds = parseDuration(duration);
      const startedAt = resolveStartedAt(options.date, options.time);

      const worklog = await jira.addWorklog({
        issueKey,
        timeSpentSeconds,
        startedAt,
        comment: options.description,
      });

      await saveState({
        ...state,
        lastIssueKey: issueKey,
      });

      console.log(`Logged ${duration} on ${issueKey} (${worklog.id})`);
    });
}

function parseDuration(input: string): number {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  let totalSeconds = 0;

  for (const part of parts) {
    const match = /^([0-9]+)([hms])$/.exec(part);

    if (!match) {
      throw new Error("Duration must be like 30m, 2h, or 45s.");
    }

    const value = Number(match[1]);
    const unit = match[2];

    if (Number.isNaN(value) || value <= 0) {
      throw new Error("Duration must be a positive number.");
    }

    switch (unit) {
      case "h":
        totalSeconds += value * 3600;
        break;
      case "m":
        totalSeconds += value * 60;
        break;
      case "s":
        totalSeconds += value;
        break;
      default:
        throw new Error("Duration must use h, m, or s.");
    }
  }

  if (totalSeconds <= 0) {
    throw new Error("Duration must be a positive number.");
  }

  return totalSeconds;
}

function resolveStartedAt(date?: string, time?: string): string {
  const resolvedDate = date ?? new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolvedDate)) {
    throw new Error("Date must be in YYYY-MM-DD format.");
  }

  const safeTime = time ?? "09:00";
  if (!/^\d{2}:\d{2}$/.test(safeTime)) {
    throw new Error("Time must be in HH:MM format.");
  }

  const [year, month, day] = resolvedDate.split("-").map(Number);
  const [hour, minute] = safeTime.split(":").map(Number);
  const started = new Date(year, month - 1, day, hour, minute, 0, 0);

  return formatJiraDate(started);
}

function formatJiraDate(date: Date): string {
  const pad = (value: number, size = 2): string =>
    String(value).padStart(size, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const offsetMins = pad(Math.abs(offsetMinutes) % 60);

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds()),
    ".",
    pad(date.getMilliseconds(), 3),
    offsetSign,
    offsetHours,
    offsetMins,
  ].join("");
}
