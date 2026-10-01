/**
 * A day's logged time, read from Jira.
 *
 * Jira is where every Worklog ends up — Clockwork's timer writes one, so does
 * `ergon log`, so does anyone typing into the Jira UI — which is why it is the
 * only vantage point a day is whole from. See
 * [ADR 0008](../docs/adr/0008-jira-is-the-record-of-logged-time.md).
 */

import { renderAdf } from "./adf.ts";
import type { JiraClient, JiraWorklogEntry } from "./api/jira.ts";
import type { Worklog } from "./types.ts";

/** An issue's worklogs, which is how Jira's API is shaped: one read per issue. */
export interface IssueWorklogs {
  issueKey: string;
  worklogs: JiraWorklogEntry[];
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
      if (!entry.started.startsWith(date)) continue;

      day.push(toWorklog(issue.issueKey, entry));
    }
  }

  return day.sort((a, b) => Date.parse(a.started) - Date.parse(b.started));
}

/**
 * `HH:MM`, sliced out of Jira's own string rather than parsed: it already
 * carries the offset it was written at, so reading it back as a `Date` would
 * only re-render it in whatever zone the terminal is in. `ergon comments` keeps
 * its own slicer, because a Comment reads with its date and a day's line does
 * not — the day is already the thing that was asked for.
 */
export function startTime(started: string): string {
  return started.slice(11, 16);
}

/**
 * `YYYY-MM-DD HH:MM`. A Removal's receipt carries the date where a day's
 * listing does not: `ergon log` defaults `--date` to today, so a time alone
 * cannot re-log a correction made to any other day.
 */
export function startStamp(started: string): string {
  return `${started.slice(0, 10)} ${startTime(started)}`;
}

/**
 * The one place a Jira entry becomes a Worklog, so that a day's breakdown and a
 * Removal's receipt describe the same entry the same way.
 */
function toWorklog(issueKey: string, entry: JiraWorklogEntry): Worklog {
  const description = renderAdf(entry.comment).text;

  return {
    id: entry.id,
    issueKey,
    started: entry.started,
    timeSpentSeconds: entry.timeSpentSeconds ?? 0,
    description: description.length > 0 ? description : null,
  };
}

/**
 * The gate on a Removal: the Worklog the invocation named, or a refusal. Pure,
 * so that both refusals are provable without a client, and throwing, like the
 * `assertRewritable` guard a Replacement passes through.
 *
 * Authorship is checked here because ergon's reads are scoped to one author
 * twice over — `readDay`'s JQL and `assembleDay`'s filter — so without it
 * `ergon unlog` could destroy records `ergon worklogs` cannot show. A
 * colleague's Worklog is refused by naming them rather than by reading as
 * absent, because "no such worklog" about a worklog that exists is the most
 * confusing answer available.
 */
export function requireRemovableWorklog(
  entries: readonly JiraWorklogEntry[],
  issueKey: string,
  worklogId: string,
  authorId: string,
): JiraWorklogEntry {
  const entry = entries.find((candidate) => candidate.id === worklogId);

  if (!entry) {
    throw new Error(`No worklog ${worklogId} on ${issueKey}.`);
  }

  if (entry.author?.accountId !== authorId) {
    const who = entry.author?.displayName ?? "another user";

    throw new Error(
      `Worklog ${worklogId} on ${issueKey} was logged by ${who}, not you.`,
    );
  }

  return entry;
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

/** The slice of Jira a Removal touches, narrow so a Removal is provable. */
export interface WorklogRemover {
  getMyAccountId(): Promise<string>;
  listIssueWorklogs(issueKey: string): Promise<JiraWorklogEntry[]>;
  deleteWorklog(issueKey: string, worklogId: string): Promise<void>;
}

/**
 * Remove a Worklog, answering with what went. The receipt is the point: a
 * correction is a Removal and then a fresh `ergon log`, so the caller needs the
 * entry's own details to type the second command — and a Removal made in error
 * is recoverable only from them. See
 * [ADR 0011](../docs/adr/0011-a-worklog-is-removed-and-re-logged.md).
 *
 * The issue's Worklogs are read first, which does three jobs at once: it finds
 * the entry so the receipt can describe it, it exposes the author for the
 * ownership check, and it makes a mismatched id ergon's own error naming both
 * halves rather than Jira's 404 naming neither. Nothing is removed unless the
 * gate returns.
 */
export async function removeWorklog(
  jira: WorklogRemover,
  issueKey: string,
  worklogId: string,
): Promise<Worklog> {
  const [authorId, entries] = await Promise.all([
    jira.getMyAccountId(),
    jira.listIssueWorklogs(issueKey),
  ]);

  const entry = requireRemovableWorklog(
    entries,
    issueKey,
    worklogId,
    authorId,
  );

  await jira.deleteWorklog(issueKey, worklogId);

  return toWorklog(issueKey, entry);
}
