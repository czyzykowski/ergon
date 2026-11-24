/**
 * Flag values parsed the same way by every command that takes them: None,
 * `--assignee` and `--labels`.
 */

import type { AssigneeField } from "./types.ts";

/** True when a flag was given the literal word "none", meaning explicitly empty. */
export function isNoneValue(input?: string): boolean {
  return input?.trim().toLowerCase() === "none";
}

/**
 * Who `--assignee` asks for: the operator, or nobody. A person's name is not
 * taken, because matching one needs a user search and a refusal for a name
 * that fits several people.
 */
export type AssigneeTarget = "me" | "none";

export function parseAssignee(input: string): AssigneeTarget {
  if (isNoneValue(input)) return "none";
  if (input.trim().toLowerCase() === "me") return "me";

  throw new Error("--assignee takes 'me' or 'none'.");
}

/** What to write for a target. Jira is asked who `me` is only when it matters. */
export async function assigneeField(
  target: AssigneeTarget,
  myAccountId: () => Promise<string>,
): Promise<AssigneeField> {
  return target === "none" ? null : { accountId: await myAccountId() };
}

/** A comma-separated `--labels` value as labels, or `undefined` when it has none. */
export function parseLabels(input?: string): string[] | undefined {
  if (!input) {
    return undefined;
  }

  const labels = input
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return labels.length > 0 ? labels : undefined;
}
