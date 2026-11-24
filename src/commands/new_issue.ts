/**
 * `fileNewIssue`: a new-issue draft in, a created issue and the next state
 * out. Every precedence chain `ergon new` walks lives here, in both modes.
 * Interactive and Non-interactive take the same path; the mode shows only
 * where Remembered state is read or written — see docs/adr/0001 — and in which
 * Prompter the caller passes.
 */

import { requireDeclaredProject } from "../config.ts";
import {
  assigneeField,
  type AssigneeTarget,
  isNoneValue,
  parseLabels,
} from "../flags.ts";
import {
  normalizeBoardId,
  parseSprint,
  requireSprintFieldId,
  resolveSprintId,
} from "../sprint.ts";
import { omitIfBlank } from "../text_source.ts";
import type {
  CachedBoard,
  ClientSowValue,
  ErgonConfig,
  ErgonState,
  ProjectFieldDefaults,
} from "../types.ts";
import { CachedJira, type NewIssueJira } from "./new_jira.ts";
import type { Prompter } from "./new_prompter.ts";

/** What the person asked for: the flags as given, and the Description read. */
export interface NewIssueDraft {
  project?: string;
  epic?: string;
  parent?: string;
  type?: string;
  summary?: string;
  /** Already read from its Source and checked as expressible. */
  description?: string;
  clientSow?: string;
  labels?: string;
  sprint?: string;
  assignee?: AssigneeTarget;
}

export interface NewIssueDeps {
  config: ErgonConfig;
  /** Remembered state and the Cache, as loaded. */
  state: ErgonState;
  interactive: boolean;
  prompter: Prompter;
  /** Jira itself; the module puts the Cache in front of it when `useCache`. */
  jira: NewIssueJira;
  /** False for `--no-cache`: ask Jira every time, leave the Cache as it was. */
  useCache: boolean;
}

export interface FiledIssue {
  key: string;
  summary: string;
}

const PARENT_REQUIRED_TYPES = new Set(["Task", "Sub-task"]);

/**
 * Create the issue the draft describes, asking the Prompter whatever the
 * draft, the Parent and config leave open. Resolves to the created issue and
 * the state to save; rejects, with nothing to save, when any step fails.
 */
export async function fileNewIssue(
  draft: NewIssueDraft,
  deps: NewIssueDeps,
): Promise<{ issue: FiledIssue; state: ErgonState }> {
  const { config, state, interactive, prompter } = deps;
  const cachedJira = deps.useCache
    ? new CachedJira(deps.jira, state.cache)
    : undefined;
  const jira: NewIssueJira = cachedJira ?? deps.jira;

  // Remembered state pre-selects a human's next answer, so a Non-interactive
  // run neither reads nor writes it — see docs/adr/0001.
  let projectKey = draft.project ??
    (interactive ? state.lastProject : undefined) ??
    config.defaults?.project ?? "";
  if (!projectKey && interactive) {
    projectKey = await prompter.project(config.projects);
  }

  if (!projectKey) {
    throw new Error("Project key is required; pass --project.");
  }

  // Creating an issue in a project asserts ergon is configured for it —
  // see docs/adr/0007.
  requireDeclaredProject(config.defaults?.projects, projectKey);

  const issueType = draft.type ?? config.defaults?.issueType ?? "Task";
  const epicNone = isNoneValue(draft.epic);
  let epicKey = epicNone ? undefined : (draft.epic ??
    (interactive ? state.lastEpic : undefined) ?? config.defaults?.epic);

  if (!epicKey && !epicNone && issueType !== "Sub-task" && interactive) {
    const epics = await jira.listEpics(projectKey);

    if (epics.length > 0) {
      epicKey = await prompter.epic(epics);
    }
  }

  const summary = draft.summary ??
    (interactive ? await prompter.summary() : undefined);

  if (!summary) {
    throw new Error("Summary is required; pass --summary.");
  }

  let parentKey = draft.parent;
  if (!parentKey && issueTypeRequiresParent(issueType) && interactive) {
    const parentTypes = issueType === "Sub-task" ? ["Task"] : ["Story"];
    parentKey = await askParentIssue(prompter, jira, projectKey, parentTypes);
  }

  const fieldDefaults = config.defaults?.projects?.[projectKey]?.fields;
  const clientSowFieldId = fieldDefaults?.clientSowFieldId;
  // Inherit from the Parent, else the Epic, which becomes this issue's parent
  // when there is no Parent — in either mode.
  const inheritFromKey = parentKey ?? epicKey;
  const parent = inheritFromKey
    ? parentFieldsFrom(
      await jira.getIssueFields(
        inheritFromKey,
        clientSowFieldId ? [clientSowFieldId, "labels"] : ["labels"],
      ),
      clientSowFieldId,
    )
    : undefined;

  const resolved = resolveFields({
    interactive,
    labelsOption: draft.labels,
    clientSowOption: draft.clientSow,
    parent,
    fieldDefaults,
    lastClientSow: state.lastClientSow,
  });

  const labels = resolved.needsLabelPrompt
    ? await prompter.labels(await jira.listLabels())
    : resolved.labels;

  const clientSow = await settleClientSow(
    resolved.clientSow,
    clientSowFieldId,
    projectKey,
    jira,
    prompter,
  );

  const sprintId = await settleSprint({
    sprint: draft.sprint,
    interactive,
    projectKey,
    fieldDefaults,
    jira,
    uncachedJira: deps.jira,
    prompter,
  });

  const customFields: Record<string, unknown> = {};
  if (clientSow && Object.keys(clientSow.payload).length > 0) {
    customFields[clientSow.fieldId] = clientSow.payload;
  }

  if (typeof sprintId === "number" && Number.isFinite(sprintId)) {
    customFields[
      requireSprintFieldId(fieldDefaults?.sprintFieldId, projectKey)
    ] = sprintId;
  }

  const assignee = draft.assignee
    ? await assigneeField(draft.assignee, () => jira.getMyAccountId())
    : undefined;

  const issue = await jira.createIssue({
    projectKey,
    summary,
    issueType,
    description: omitIfBlank(draft.description),
    parentKey: parentKey ?? epicKey,
    labels,
    assignee,
    customFields,
  });

  return {
    issue: { key: issue.key, summary },
    state: {
      ...rememberCreated(state, {
        projectKey,
        epicKey,
        issueKey: issue.key,
        clientSow: clientSow?.payload.id ?? clientSow?.payload.value,
      }, interactive),
      // --no-cache leaves the saved Cache as it was.
      cache: cachedJira?.cache ?? state.cache,
    },
  };
}

function issueTypeRequiresParent(type?: string): boolean {
  if (!type) {
    return true;
  }

  return PARENT_REQUIRED_TYPES.has(type);
}

/**
 * A Parent's key: typed outright, or picked from a search of the project's
 * issues of the given types.
 */
async function askParentIssue(
  prompter: Prompter,
  jira: NewIssueJira,
  projectKey: string,
  parentTypes: string[],
): Promise<string> {
  const query = await prompter.parentQuery(parentTypes);

  if (/^[A-Z][A-Z0-9]+-\d+$/.test(query)) {
    return query;
  }

  const typesList = parentTypes.map((type) => `"${type}"`).join(", ");
  // Backslash first, or the one escaping a quote is escaped in turn.
  const text = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const jql =
    `project = ${projectKey} AND issuetype in (${typesList}) AND text ~ "${text}" ORDER BY updated DESC`;
  const matches = await jira.search(jql, 20);

  if (matches.length === 0) {
    throw new Error("No matching parent issues found.");
  }

  return await prompter.parent(matches, parentTypes);
}

/**
 * The Client SOW to write and the field to write it to, or `undefined` when
 * the plan skips it.
 */
async function settleClientSow(
  plan: ClientSowPlan,
  clientSowFieldId: string | undefined,
  projectKey: string,
  jira: NewIssueJira,
  prompter: Prompter,
): Promise<{ fieldId: string; payload: Record<string, string> } | undefined> {
  // Undefined only when the plan is "skip"; anything else throws here rather
  // than settle a Client SOW against a field the project never declared.
  const fieldId = requireClientSowFieldId(plan, clientSowFieldId, projectKey);

  if (!fieldId || plan.kind === "skip") {
    return undefined;
  }

  if (plan.kind === "payload") {
    // Inherited values arrive with their option id attached, so they need no
    // lookup against the field's options.
    return { fieldId, payload: plan.payload };
  }

  // Both remaining kinds — lookup and prompt — settle against the options.
  const options = await jira.getFieldOptions(fieldId);

  if (plan.kind === "lookup") {
    const match = options.find((option) =>
      option.id === plan.value || option.value === plan.value
    );

    return {
      fieldId,
      payload: match ? { id: match.id } : { value: plan.value },
    };
  }

  return {
    fieldId,
    payload: optionPayload(await prompter.clientSow(options, plan.default)),
  };
}

/**
 * The Sprint to file into, from `--sprint` resolved as `edit` resolves it, or
 * else asked on an Interactive run; none is fine.
 */
async function settleSprint(input: {
  sprint?: string;
  interactive: boolean;
  projectKey: string;
  fieldDefaults?: ProjectFieldDefaults;
  jira: NewIssueJira;
  /** Jira without the Cache, whose boards carry their type. */
  uncachedJira: NewIssueJira;
  prompter: Prompter;
}): Promise<number | undefined> {
  const { sprint, interactive, projectKey, jira, prompter } = input;
  const configuredBoardId = input.fieldDefaults?.sprintBoardId;

  if (sprint === undefined) {
    // A plain absence leaves a Non-interactive run without a Sprint.
    return interactive
      ? await askSprint(prompter, jira, projectKey, configuredBoardId)
      : undefined;
  }

  const target = parseSprint(sprint);
  if (target.kind === "none") return undefined;
  if (target.kind === "id") return target.id;

  // Boards straight from Jira: the cached ones carry no board type.
  return await resolveSprintId({
    projectKey,
    jira,
    boards: await input.uncachedJira.listBoards(projectKey),
    configuredBoardId,
    name: target.kind === "name" ? target.name : undefined,
  });
}

/** The Active Sprint the person picks, on a board they pick if they must. */
async function askSprint(
  prompter: Prompter,
  jira: NewIssueJira,
  projectKey: string,
  configuredBoardId?: number | string,
): Promise<number | undefined> {
  const boardId = await chooseSprintBoard(
    prompter,
    await jira.listBoards(projectKey),
    configuredBoardId,
  );

  if (!boardId) return undefined;

  // Never cached: an active Sprint is a fact with a shelf life.
  const sprints = await jira.listActiveSprints(boardId);

  return sprints.length > 0 ? await prompter.sprint(sprints) : undefined;
}

/**
 * The board to pick an Active Sprint from: the configured one, else the only
 * one, else the board the person picks.
 */
async function chooseSprintBoard(
  prompter: Prompter,
  boards: CachedBoard[],
  boardId?: number | string,
): Promise<number | undefined> {
  const normalized = normalizeBoardId(boardId);
  if (normalized) {
    return normalized;
  }

  if (boards.length === 0) {
    return undefined;
  }

  if (boards.length === 1) {
    return boards[0].id;
  }

  return await prompter.board(boards);
}

/** The Client SOW and labels carried by the issue being inherited from. */
interface ParentFieldValues {
  clientSow?: ClientSowValue;
  labels?: string[];
}

/**
 * What the caller must do to settle the Client SOW. Resolution stops short of a
 * payload when it needs IO: `lookup` still has to be matched against the field's
 * options, and `prompt` has to be put to the operator.
 */
type ClientSowPlan =
  | { kind: "skip" }
  | { kind: "payload"; payload: Record<string, string> }
  | { kind: "lookup"; value: string }
  | { kind: "prompt"; default?: string };

interface ResolveFieldsInput {
  interactive: boolean;
  labelsOption?: string;
  clientSowOption?: string;
  parent?: ParentFieldValues;
  fieldDefaults?: ProjectFieldDefaults;
  lastClientSow?: string;
}

interface ResolvedFields {
  labels?: string[];
  needsLabelPrompt: boolean;
  clientSow: ClientSowPlan;
}

/**
 * The field id to settle this plan against, or `undefined` when the plan needs
 * no field at all. Every kind but `skip` either reads the field's options or
 * writes to it, so an unconfigured project is an error there rather than a
 * silent write to a guessed field — see docs/adr/0002.
 */
function requireClientSowFieldId(
  plan: ClientSowPlan,
  fieldId: string | undefined,
  projectKey: string,
): string | undefined {
  if (plan.kind === "skip") {
    return undefined;
  }

  if (!fieldId) {
    throw new Error(
      `No Client SOW field configured for ${projectKey}. Set ` +
        `defaults.projects.${projectKey}.fields.clientSowFieldId in ` +
        `~/.config/ergon/config.yaml, or pass --client-sow none.`,
    );
  }

  return fieldId;
}

function extractOptionValue(
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

function optionPayload(option: ClientSowValue): Record<string, string> {
  if (option.id) {
    return { id: option.id };
  }

  if (option.value) {
    return { value: option.value };
  }

  return {};
}

/**
 * Read the inheritable fields out of a raw Jira issue `fields` object. A project
 * with no Client SOW field declared inherits labels alone.
 */
function parentFieldsFrom(
  fields: Record<string, unknown>,
  clientSowFieldId: string | undefined,
): ParentFieldValues {
  return {
    clientSow: clientSowFieldId
      ? extractOptionValue(fields[clientSowFieldId])
      : undefined,
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

  // Jira cannot express "deliberately unlabelled" — an issue nobody labelled
  // and an issue someone cleared both arrive as [] — so an empty array is read
  // as nothing to inherit rather than as an inherited answer.
  const parentLabels = input.parent?.labels;
  const inherited = parentLabels?.length ? parentLabels : undefined;
  const labels = inherited ?? input.fieldDefaults?.labels;

  return {
    labels,
    needsLabelPrompt: input.interactive && !labels?.length,
  };
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
function resolveFields(input: ResolveFieldsInput): ResolvedFields {
  const { labels, needsLabelPrompt } = resolveLabels(input);

  return { labels, needsLabelPrompt, clientSow: resolveClientSow(input) };
}

/** What a successful `ergon new` leaves behind for the next run. */
interface CreatedIssue {
  projectKey: string;
  epicKey?: string;
  issueKey: string;
  /** The Client SOW the issue was given, as an option id or display value. */
  clientSow?: string;
}

/**
 * The Remembered state after `created`. The issue key is always recorded, as
 * the default for follow-up commands; the project, epic and Client SOW only
 * pre-select a human's next answer, so a Non-interactive run leaves them as
 * they were — see docs/adr/0001.
 */
function rememberCreated(
  state: ErgonState,
  created: CreatedIssue,
  interactive: boolean,
): ErgonState {
  if (!interactive) {
    return { ...state, lastIssueKey: created.issueKey };
  }

  return {
    ...state,
    lastProject: created.projectKey,
    lastEpic: created.epicKey,
    lastIssueKey: created.issueKey,
    lastClientSow: created.clientSow ?? state.lastClientSow,
  };
}
