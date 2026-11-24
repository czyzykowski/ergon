import { isDate } from "../dates.ts";
import { isActiveSprintKeyword } from "../sprint.ts";
import type { AssigneeTarget } from "./new_issue.ts";
import { isNoneValue, parseAssignee } from "./new_issue.ts";

/** Which Sprint a `--sprint` value asks for, before Jira has been consulted. */
export type SprintTarget =
  | { kind: "none" }
  | { kind: "id"; id: number }
  | { kind: "active" }
  | { kind: "name"; name: string };

/** One field an invocation writes. A Description's value needs IO to settle. */
export type EditWrite =
  | { field: "description" }
  | { field: "summary"; value: string }
  | { field: "due"; value: string | null }
  | { field: "sprint"; target: SprintTarget }
  | { field: "assignee"; target: AssigneeTarget };

export interface EditPlan {
  /** In the receipt's order: description, summary, due, sprint, assignee. */
  writes: EditWrite[];
  opensEditor: boolean;
  /** Whether the current Description must be fetched and checked first. */
  fetchesDescription: boolean;
}

export interface EditOptions {
  summary?: string;
  description?: string;
  due?: string;
  sprint?: string;
  assignee?: string;
  force?: boolean;
}

/**
 * The flag behind each field option, in the order a refusal lists them. Keyed
 * on `EditOptions`, so a field option added there without a flag here fails to
 * type-check rather than going unmentioned when no field was named.
 */
const FIELD_FLAGS: Record<Exclude<keyof EditOptions, "force">, string> = {
  summary: "--summary",
  description: "--description",
  due: "--due",
  sprint: "--sprint",
  assignee: "--assignee",
};

/** The field flags as prose: "--summary, --description, … or --assignee". */
export function fieldFlagList(): string {
  const flags = Object.values(FIELD_FLAGS);

  return `${flags.slice(0, -1).join(", ")} or ${flags.at(-1)}`;
}

/**
 * What an invocation writes: name a field and `edit` writes that field, name
 * none and it opens the Description.
 *
 * The Description is fetched, and ADR 0003's refusal applied, only when the
 * Description is in play. Refusing to set a due date because of a table nobody
 * touched is that refusal escaping its own scope.
 */
export function planEdit(options: EditOptions): EditPlan {
  const writes: EditWrite[] = [];

  if (options.description !== undefined) {
    writes.push({ field: "description" });
  }

  if (options.summary !== undefined) {
    writes.push({ field: "summary", value: options.summary });
  }

  if (options.due !== undefined) {
    writes.push({ field: "due", value: parseDue(options.due) });
  }

  if (options.sprint !== undefined) {
    writes.push({ field: "sprint", target: parseSprint(options.sprint) });
  }

  if (options.assignee !== undefined) {
    writes.push({ field: "assignee", target: parseAssignee(options.assignee) });
  }

  // --force means "flatten this deliberately", which only makes sense when the
  // replacement was written by hand. See ADR 0003.
  if (options.force && options.description === undefined) {
    throw new Error("--force applies only to --description.");
  }

  const namedAField = writes.length > 0;

  return {
    writes,
    opensEditor: !namedAField,
    fetchesDescription: !namedAField || options.description !== undefined,
  };
}

function parseDue(value: string): string | null {
  if (isNoneValue(value)) return null;

  if (!isDate(value)) {
    throw new Error("--due must be a date in YYYY-MM-DD format, or 'none'.");
  }

  return value.trim();
}

function parseSprint(value: string): SprintTarget {
  const trimmed = value.trim();

  if (isNoneValue(trimmed)) return { kind: "none" };

  if (/^\d+$/.test(trimmed)) return { kind: "id", id: Number(trimmed) };

  if (isActiveSprintKeyword(trimmed)) return { kind: "active" };

  return { kind: "name", name: trimmed };
}
