/**
 * Which Sprint is the Active Sprint, resolved the same way for every command
 * that writes one — see
 * [resolve-current-sprint.md](../specs/resolve-current-sprint.md).
 *
 * Nothing here is cached. Which Sprint is active is a fact with a one-week
 * shelf life, and a remembered answer — a cache once, a copied id in a skill
 * later — names a closed Sprint that Jira refuses to write to.
 */

import type { JiraBoard, JiraSprint } from "./api/jira.ts";

/** Enough of a board to choose between boards and name the one chosen. */
export interface BoardRef {
  id: number;
  name?: string;
  /** Jira's board type; only a scrum board has Sprints to ask about. */
  type?: string;
}

/** The part of the Jira client this module needs, so a test can stand in. */
export interface ActiveSprintSource {
  listActiveSprints(boardId: number): Promise<JiraSprint[]>;
}

/** The part of the Jira client `listOpenSprints` needs. */
export interface OpenSprintSource {
  listOpenSprints(boardId: number): Promise<JiraSprint[]>;
}

/** An Open Sprint as `ergon sprints` reports it, once however many boards show it. */
export interface OpenSprint {
  id: number;
  name: string;
  state: "active" | "future";
  /** Null where Jira has no date: fetched and found empty, not Absent. */
  startDate: string | null;
  endDate: string | null;
  /** The boards showing it, in the order the project's boards were listed. */
  boards: { id: number; name: string }[];
}

/**
 * Where a caller stuck on `--sprint` can see what it accepts. Until a future
 * Sprint can be named, its id is the only way to write it.
 */
export function sprintsHint(projectKey: string): string {
  return `Run 'ergon sprints ${projectKey}' to see open sprint ids.`;
}

/**
 * Whether a `--sprint` value asks for the Active Sprint. `current` once did,
 * and is refused by name so an old instruction fails with its fix rather than
 * being taken for a Sprint's name.
 */
export function isActiveSprintKeyword(value: string): boolean {
  const keyword = value.trim().toLowerCase();

  if (keyword === "current") {
    throw new Error("--sprint current was renamed to 'active'.");
  }

  return keyword === "active";
}

/** Which Sprint a `--sprint` value asks for, before Jira has been consulted. */
export type SprintTarget =
  | { kind: "none" }
  | { kind: "id"; id: number }
  | { kind: "active" }
  | { kind: "name"; name: string };

/** What a `--sprint` value asks for, the same for every command taking one. */
export function parseSprint(value: string): SprintTarget {
  const trimmed = value.trim();

  if (trimmed.toLowerCase() === "none") return { kind: "none" };

  if (/^\d+$/.test(trimmed)) return { kind: "id", id: Number(trimmed) };

  if (isActiveSprintKeyword(trimmed)) return { kind: "active" };

  return { kind: "name", name: trimmed };
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
 * The boards to ask for the Active Sprint. A configured id wins outright —
 * Jira is the authority on whether it is usable. Otherwise every board that
 * can hold a Sprint is asked, because boards sharing a Sprint share the answer
 * and only a disagreement between them is an ambiguity.
 */
function boardsToAsk(
  boards: readonly BoardRef[],
  configuredBoardId?: number | string,
): BoardRef[] {
  const configured = normalizeBoardId(configuredBoardId);
  if (configured) {
    return [
      boards.find((board) => board.id === configured) ?? { id: configured },
    ];
  }

  const candidates = boards.filter(holdsSprints);
  if (candidates.length === 0) {
    throw new Error("No board available to resolve the sprint.");
  }

  return candidates;
}

/**
 * Whether a board can hold a Sprint. A board of unknown type is given the
 * benefit of the doubt; a kanban board is not asked, because Jira answers a
 * Sprint request on one with an error.
 */
function holdsSprints(board: BoardRef): boolean {
  return board.type === undefined || board.type === "scrum";
}

/**
 * The project's boards that can hold a Sprint. None at all is an error rather
 * than an empty answer: "this project never has Sprints" is not "nothing is
 * planned right now".
 */
export function scrumBoards(
  boards: readonly JiraBoard[],
  projectKey: string,
): JiraBoard[] {
  const candidates = boards.filter(holdsSprints);
  if (candidates.length === 0) {
    throw new Error(`No scrum board on ${projectKey}; it has no sprints.`);
  }

  return candidates;
}

/**
 * Every Open Sprint the boards show, each once. Active Sprints lead, then
 * future ones; within each, a Sprint stands where it first appears, walking
 * the boards in order — so one board, or boards sharing their Sprints, read in
 * the board's own sequence.
 */
export async function listOpenSprints(input: {
  jira: OpenSprintSource;
  boards: readonly JiraBoard[];
}): Promise<OpenSprint[]> {
  const answers = await Promise.all(
    input.boards.map((board) => input.jira.listOpenSprints(board.id)),
  );

  const found = new Map<number, OpenSprint>();
  input.boards.forEach((board, index) => {
    for (const sprint of answers[index]) {
      const known = found.get(sprint.id);
      if (known) {
        known.boards.push({ id: board.id, name: board.name });
        continue;
      }

      found.set(sprint.id, {
        id: sprint.id,
        name: sprint.name,
        // Only active and future were asked for, so what is not one is the other.
        state: sprint.state === "active" ? "active" : "future",
        startDate: sprint.startDate ?? null,
        endDate: sprint.endDate ?? null,
        boards: [{ id: board.id, name: board.name }],
      });
    }
  });

  const sprints = [...found.values()];
  return [
    ...sprints.filter((sprint) => sprint.state === "active"),
    ...sprints.filter((sprint) => sprint.state === "future"),
  ];
}

export function boardLabel(board: BoardRef): string {
  return board.name ? `${board.name} (${board.id})` : `${board.id}`;
}

/**
 * The id of the Active Sprint, asked of Jira at the moment of the write: the
 * one every candidate board agrees on, or the one going by `name`.
 * `listActiveSprints` filters `state=active` server-side, so an answer is an
 * active one by construction. Different answers from different boards are
 * refused rather than chosen between, because a guess writes to another
 * board's Sprint silently.
 */
export async function resolveSprintId(input: {
  /** The project being written, named in the hint a refusal ends with. */
  projectKey: string;
  jira: ActiveSprintSource;
  boards: readonly BoardRef[];
  configuredBoardId?: number | string;
  /** A Sprint to match by name among the active ones, instead of the only one. */
  name?: string;
}): Promise<number> {
  const boards = boardsToAsk(input.boards, input.configuredBoardId);
  const answers = await Promise.all(
    boards.map((board) => input.jira.listActiveSprints(board.id)),
  );

  // Each Sprint once, on the first board that showed it.
  const found = new Map<number, { sprint: JiraSprint; board: BoardRef }>();
  boards.forEach((board, index) => {
    for (const sprint of answers[index]) {
      if (!found.has(sprint.id)) found.set(sprint.id, { sprint, board });
    }
  });
  const sprints = [...found.values()];

  if (input.name !== undefined) {
    const match = sprints.find(({ sprint }) =>
      sprint.name.toLowerCase() === input.name?.toLowerCase()
    );

    if (!match) {
      throw new Error(
        `Active sprint "${input.name}" not found. ${
          sprintsHint(input.projectKey)
        }`,
      );
    }

    return match.sprint.id;
  }

  if (sprints.length === 0) {
    throw new Error(
      `No active sprint on ${boards.map(boardLabel).join(", ")}.`,
    );
  }

  if (sprints.length > 1) {
    const listed = sprints
      .map(({ sprint, board }) =>
        `${sprint.name} (${sprint.id}) on ${boardLabel(board)}`
      )
      .join(", ");
    throw new Error(
      `Several active sprints: ${listed}. Pass a numeric --sprint id, or ` +
        `set a default sprintBoardId. ${sprintsHint(input.projectKey)}`,
    );
  }

  const [{ sprint, board }] = sprints;
  console.error(
    `Using active sprint: ${sprint.name} (${sprint.id}) from board ${
      boardLabel(board)
    }`,
  );

  return sprint.id;
}
