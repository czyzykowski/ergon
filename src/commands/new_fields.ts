import type { ProjectFieldDefaults } from "../types.ts";

/** A Client SOW option, as either a Jira option id or its raw display value. */
export interface ClientSowValue {
  id?: string;
  value?: string;
}

/** The Client SOW and labels carried by the issue being inherited from. */
export interface ParentFieldValues {
  clientSow?: ClientSowValue;
  labels?: string[];
}

/**
 * What the caller must do to settle the Client SOW. Resolution stops short of a
 * payload when it needs IO: `lookup` still has to be matched against the field's
 * options, and `prompt` has to be put to the operator.
 */
export type ClientSowPlan =
  | { kind: "skip" }
  | { kind: "payload"; payload: Record<string, string> }
  | { kind: "lookup"; value: string }
  | { kind: "prompt"; default?: string };

export interface ResolveFieldsInput {
  interactive: boolean;
  labelsOption?: string;
  clientSowOption?: string;
  parent?: ParentFieldValues;
  fieldDefaults?: ProjectFieldDefaults;
  lastClientSow?: string;
}

export interface ResolvedFields {
  labels?: string[];
  needsLabelPrompt: boolean;
  clientSow: ClientSowPlan;
}

/** True when a flag was given the literal word "none", meaning explicitly empty. */
export function isNoneValue(input?: string): boolean {
  return input?.trim().toLowerCase() === "none";
}

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

export function extractOptionValue(
  fieldValue: unknown,
): ClientSowValue | undefined {
  if (!fieldValue) {
    return undefined;
  }

  if (typeof fieldValue === "string") {
    return { value: fieldValue };
  }

  if (typeof fieldValue === "object") {
    const record = fieldValue as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : undefined;
    const value = typeof record.value === "string" ? record.value : undefined;

    if (id || value) {
      return { id, value };
    }
  }

  return undefined;
}

export function optionPayload(option: ClientSowValue): Record<string, string> {
  if (option.id) {
    return { id: option.id };
  }

  if (option.value) {
    return { value: option.value };
  }

  return {};
}

/** Read the inheritable fields out of a raw Jira issue `fields` object. */
export function parentFieldsFrom(
  fields: Record<string, unknown>,
  clientSowFieldId: string,
): ParentFieldValues {
  return {
    clientSow: extractOptionValue(fields[clientSowFieldId]),
    labels: Array.isArray(fields.labels)
      ? fields.labels.filter((value): value is string =>
        typeof value === "string"
      )
      : undefined,
  };
}

function resolveLabels(
  input: ResolveFieldsInput,
): { labels?: string[]; needsLabelPrompt: boolean } {
  if (isNoneValue(input.labelsOption)) {
    return { labels: undefined, needsLabelPrompt: false };
  }

  const override = parseLabels(input.labelsOption);
  if (override) {
    return { labels: override, needsLabelPrompt: false };
  }

  const parentLabels = input.parent?.labels;

  if (!input.interactive) {
    // Jira cannot express "deliberately unlabelled" — an issue nobody labelled
    // and an issue someone cleared both arrive as [] — so an empty array is
    // read as nothing to inherit rather than as an inherited answer.
    const inherited = parentLabels?.length ? parentLabels : undefined;

    return {
      labels: inherited ?? input.fieldDefaults?.labels,
      needsLabelPrompt: false,
    };
  }

  // Interactive keeps the older reading, where an empty parent array short
  // circuits the chain and leaves the operator to answer the prompt.
  const labels = parentLabels ?? input.fieldDefaults?.labels;

  return { labels, needsLabelPrompt: !labels || labels.length === 0 };
}

function resolveClientSow(input: ResolveFieldsInput): ClientSowPlan {
  if (isNoneValue(input.clientSowOption)) {
    return { kind: "skip" };
  }

  if (input.clientSowOption) {
    return { kind: "lookup", value: input.clientSowOption };
  }

  const parentClientSow = input.parent?.clientSow;

  if (input.interactive) {
    return {
      kind: "prompt",
      default: parentClientSow?.id ?? parentClientSow?.value ??
        input.lastClientSow ?? input.fieldDefaults?.clientSowValue,
    };
  }

  // Non-interactive resolves from deterministic inputs only, so lastClientSow
  // is absent here by design — see docs/adr/0001.
  if (parentClientSow?.id || parentClientSow?.value) {
    return { kind: "payload", payload: optionPayload(parentClientSow) };
  }

  const configured = input.fieldDefaults?.clientSowValue;

  return configured ? { kind: "lookup", value: configured } : { kind: "skip" };
}

/**
 * Settle the Client SOW and labels for a new issue from the flags given, the
 * Parent's values, and the project's configured defaults.
 */
export function resolveFields(input: ResolveFieldsInput): ResolvedFields {
  const { labels, needsLabelPrompt } = resolveLabels(input);

  return { labels, needsLabelPrompt, clientSow: resolveClientSow(input) };
}
