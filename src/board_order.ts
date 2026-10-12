/**
 * Board order: the order a board presents its issues in — the active Sprint,
 * then each upcoming Sprint in the board's own sequence, then the backlog, with
 * Rank deciding only within each group. See
 * [ADR 0013](../docs/adr/0013-board-order-belongs-to-the-board.md).
 */

import type { JiraIssueResponse } from "./api/jira.ts";
import { normalizeBoardId } from "./sprint.ts";
import type { ProjectDefaults } from "./types.ts";

/** What ordering needs to know of a board, as Jira describes it. */
export interface BoardConfiguration {
  /** The saved filter that decides which issues are on the board. */
  filterId: string;
  /** Whether the board is ordered by dragging at all. */
  ranked: boolean;
}

/** The part of the Jira client this module needs, so a test can stand in. */
export interface BoardSource {
  getBoardConfiguration(boardId: number): Promise<BoardConfiguration>;
  /** The board's active and future Sprint ids, in the board's sequence. */
  listOpenSprintIds(boardId: number): Promise<number[]>;
  /** Every issue the JQL matches, in the JQL's order. */
  searchAll(jql: string): Promise<JiraIssueResponse[]>;
}

/**
 * The board an ordering is read from. A named project's board, or — with no
 * project — the one board every configured project lives on. Projects on
 * different boards were never ranked against each other, so that is an error
 * rather than an order nobody chose.
 */
export function boardForScope(
  projects: Record<string, ProjectDefaults> | undefined,
  projectKey?: string,
): number {
  const keys = projectKey ? [projectKey] : Object.keys(projects ?? {});

  if (keys.length === 0) {
    throw new Error(
      "--order board needs a configured project to find the board from.",
    );
  }

  const boards = keys.map((key) => {
    const id = normalizeBoardId(projects?.[key]?.fields?.sprintBoardId);

    if (id === undefined) {
      throw new Error(
        `No board configured for ${key}. Set ` +
          `defaults.projects.${key}.fields.sprintBoardId in ` +
          `~/.config/ergon/config.yaml.`,
      );
    }

    return { key, id };
  });

  const distinct = new Set(boards.map((board) => board.id));
  if (distinct.size > 1) {
    const where = boards.map((board) => `${board.key} on ${board.id}`).join(
      ", ",
    );
    throw new Error(
      `Board order does not cross boards (${where}); pass --project.`,
    );
  }

  return boards[0].id;
}

/**
 * The query for a board's issues: the board's own filter narrowed by the
 * caller's clauses, in Rank order. Issues in no open Sprint that are Done are
 * off the board, so they are not fetched; `boardOrder` drops them regardless.
 */
export function boardJql(filterId: string, clauses: readonly string[]): string {
  return [
    `filter = ${filterId}`,
    ...clauses,
    "(sprint in openSprints() OR sprint in futureSprints() OR statusCategory != Done)",
  ].join(" AND ") + " ORDER BY Rank ASC";
}

/**
 * The ids of the Sprints an issue carries. Every declared sprint field is read:
 * an issue from a project ergon is not configured for can still be on the
 * board, and Jira omits a field a project lacks rather than erroring.
 */
export function sprintIdsOf(
  issue: JiraIssueResponse,
  projects: Record<string, ProjectDefaults> = {},
): number[] {
  const raw = (issue.fields ?? {}) as unknown as Record<string, unknown>;
  const fieldIds = new Set(
    Object.values(projects).map((project) => project?.fields?.sprintFieldId),
  );
  const ids: number[] = [];

  for (const fieldId of fieldIds) {
    const value = raw[fieldId ?? ""];
    if (!Array.isArray(value)) continue;

    for (const sprint of value) {
      const id = (sprint as Record<string, unknown> | null)?.id;
      if (typeof id === "number") ids.push(id);
    }
  }

  return ids;
}

export interface Placed<T> {
  item: T;
  sprintIds: readonly number[];
  done: boolean;
}

/**
 * Rank-ordered issues regrouped into Board order. The sort is stable, so Rank
 * survives within each group; a Done issue in no open Sprint is dropped.
 */
export function boardOrder<T>(
  issues: readonly Placed<T>[],
  openSprintIds: readonly number[],
): T[] {
  const backlog = openSprintIds.length;
  const group = (issue: Placed<T>): number =>
    Math.min(
      backlog,
      ...issue.sprintIds
        .map((id) => openSprintIds.indexOf(id))
        .filter((index) => index >= 0),
    );

  return issues
    .map((issue) => ({ issue, group: group(issue) }))
    .filter(({ issue, group }) => group < backlog || !issue.done)
    .sort((a, b) => a.group - b.group)
    .map(({ issue }) => issue.item);
}

/** A board's issues, narrowed by `clauses`, in Board order. */
export async function listInBoardOrder(input: {
  jira: BoardSource;
  boardId: number;
  clauses: readonly string[];
  projects?: Record<string, ProjectDefaults>;
}): Promise<JiraIssueResponse[]> {
  const configuration = await input.jira.getBoardConfiguration(input.boardId);

  if (!configuration.ranked) {
    throw new Error(
      `Board ${input.boardId} is not ordered by Rank, so it has no Board order.`,
    );
  }

  const [openSprintIds, issues] = await Promise.all([
    input.jira.listOpenSprintIds(input.boardId),
    input.jira.searchAll(boardJql(configuration.filterId, input.clauses)),
  ]);

  return boardOrder(
    issues.map((issue) => ({
      item: issue,
      sprintIds: sprintIdsOf(issue, input.projects),
      done: issue.fields?.status?.statusCategory?.key === "done",
    })),
    openSprintIds,
  );
}
