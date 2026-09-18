/**
 * A day's logged time, read from Jira.
 *
 * Jira is where every Worklog ends up — Clockwork's timer writes one, so does
 * `ergon log`, so does anyone typing into the Jira UI — which is why it is the
 * only vantage point a day is whole from. See
 * [ADR 0008](../docs/adr/0008-jira-is-the-record-of-logged-time.md).
 */

import { renderAdf } from "./adf.ts";
import type { JiraClient } from "./api/jira.ts";
import type { Worklog } from "./types.ts";

/** One worklog as Jira's per-issue endpoint returns it. */
export interface JiraWorklogEntry {
  author?: { accountId?: string };
  started?: string;
  timeSpentSeconds?: number;
  comment?: unknown;
}

/** An issue's worklogs, which is how Jira's API is shaped: one read per issue. */
export interface IssueWorklogs {
  issueKey: string;
  worklogs: JiraWorklogEntry[];
}

/** Today in the operator's own timezone, which is the day they mean. */
export function today(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${
    pad(now.getDate())
  }`;
}

/**
 * The day, in the order it happened. Filtered to one author and one date
 * because Jira's worklog endpoint is per-issue and answers with everything
 * anyone ever logged there.
 *
 * `started` is passed through as Jira wrote it, offset and all, so no timezone
 * is applied on anybody's behalf.
 */
export function assembleDay(
  issues: readonly IssueWorklogs[],
  authorId: string,
  date: string,
): Worklog[] {
  const day: Worklog[] = [];

  for (const issue of issues) {
    for (const entry of issue.worklogs) {
      if (entry.author?.accountId !== authorId) continue;
      if (!entry.started?.startsWith(date)) continue;

      const description = renderAdf(entry.comment).text;

      day.push({
        issueKey: issue.issueKey,
        started: entry.started,
        timeSpentSeconds: entry.timeSpentSeconds ?? 0,
        description: description.length > 0 ? description : null,
      });
    }
  }

  return day.sort((a, b) => Date.parse(a.started) - Date.parse(b.started));
}

/** The one place a day is summed, so the breakdown and the total agree. */
export function totalSeconds(worklogs: readonly Worklog[]): number {
  return worklogs.reduce((total, entry) => total + entry.timeSpentSeconds, 0);
}

/**
 * A day, fetched. Jira has no by-user-by-date worklog read, so it takes a
 * search for the issues carrying this author's worklogs on the date and then
 * one worklog read per issue found.
 */
export async function readDay(
  jira: JiraClient,
  date: string,
): Promise<Worklog[]> {
  const accountId = await jira.getMyAccountId();
  const issues = await jira.search(
    `worklogAuthor = currentUser() AND worklogDate = "${date}"`,
    100,
  );

  const perIssue = await Promise.all(
    issues.map(async (issue) => ({
      issueKey: issue.key,
      worklogs: await jira.listIssueWorklogs(issue.key),
    })),
  );

  return assembleDay(perIssue, accountId, date);
}
