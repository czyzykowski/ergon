/**
 * Which Sprint is current, resolved the same way for every command that writes
 * one — see [resolve-current-sprint.md](../specs/resolve-current-sprint.md).
 *
 * Nothing here is cached. Which Sprint is active is a fact with a two-week
 * shelf life, and caching it once left `--sprint current` reporting a Sprint
 * that had closed months earlier.
 */

import type { JiraSprint } from "./api/jira.ts";

/** Enough of a board to choose between boards and name the one chosen. */
export interface BoardRef {
  id: number;
  name?: string;
}

/** The part of the Jira client this module needs, so a test can stand in. */
export interface ActiveSprintSource {
  listActiveSprints(boardId: number): Promise<JiraSprint[]>;
}

/** A board id as config may hold it: a number, or a string out of YAML. */
export function normalizeBoardId(value?: number | string): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return undefined;
}

/**
 * The field id to write a Sprint to, or an error naming the config key. A
 * project ergon cannot locate the field for is an error rather than a write to
 * a guessed field — see docs/adr/0007.
 */
export function requireSprintFieldId(
  fieldId: string | undefined,
  projectKey: string,
): string {
  if (!fieldId) {
    throw new Error(
      `No sprint field configured for ${projectKey}. Set ` +
        `defaults.projects.${projectKey}.fields.sprintFieldId in ` +
        `~/.config/ergon/config.yaml.`,
    );
  }

  return fieldId;
}

/**
 * The board to resolve a Sprint from. A configured id wins outright — Jira is
 * the authority on whether it is usable — and a single board needs no
 * configuration. Anything else is an ambiguity ergon refuses rather than
 * guesses at, because a guess writes to another board's Sprint silently.
 */
export function selectSprintBoard(
  boards: readonly BoardRef[],
  configuredBoardId?: number | string,
): number {
  const configured = normalizeBoardId(configuredBoardId);
  if (configured) {
    return configured;
  }

  if (boards.length === 0) {
    throw new Error("No board available to resolve the sprint.");
  }

  if (boards.length > 1) {
    throw new Error(
      "Multiple boards found; set a default sprintBoardId or pass a numeric --sprint id.",
    );
  }

  return boards[0].id;
}

/**
 * The id of the board's active Sprint, asked of Jira at the moment of the
 * write. `listActiveSprints` filters `state=active` server-side, so the first
 * answer is an active one by construction.
 */
export async function resolveSprintId(input: {
  jira: ActiveSprintSource;
  boards: readonly BoardRef[];
  configuredBoardId?: number | string;
}): Promise<number> {
  const boardId = selectSprintBoard(input.boards, input.configuredBoardId);
  const sprints = await input.jira.listActiveSprints(boardId);

  if (sprints.length === 0) {
    throw new Error("No active sprint found for the board.");
  }

  const sprint = sprints[0];
  const board = input.boards.find((candidate) => candidate.id === boardId);
  const boardLabel = board?.name ? `${board.name} (${boardId})` : `${boardId}`;

  console.error(
    `Using active sprint: ${sprint.name} (${sprint.id}) from board ${boardLabel}`,
  );

  return sprint.id;
}
