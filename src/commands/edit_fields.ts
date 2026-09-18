import { isNoneValue } from "./new_fields.ts";

/** Which Sprint a `--sprint` value asks for, before Jira has been consulted. */
export type SprintTarget =
  | { kind: "none" }
  | { kind: "id"; id: number }
  | { kind: "current" }
  | { kind: "name"; name: string };

/** One field an invocation writes. A Description's value needs IO to settle. */
export type EditWrite =
  | { field: "description" }
  | { field: "summary"; value: string }
  | { field: "due"; value: string | null }
  | { field: "sprint"; target: SprintTarget };

export interface EditPlan {
  /** In the receipt's order: description, summary, due, sprint. */
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
  force?: boolean;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

  if (!DATE_PATTERN.test(value.trim())) {
    throw new Error("--due must be a date in YYYY-MM-DD format, or 'none'.");
  }

  return value.trim();
}

function parseSprint(value: string): SprintTarget {
  const trimmed = value.trim();

  if (isNoneValue(trimmed)) return { kind: "none" };

  if (/^\d+$/.test(trimmed)) return { kind: "id", id: Number(trimmed) };

  const keyword = trimmed.toLowerCase();
  if (keyword === "current" || keyword === "active") return { kind: "current" };

  return { kind: "name", name: trimmed };
}
