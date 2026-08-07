import type { Command } from "cliffy/command/mod.ts";
import { Input, Select } from "cliffy/prompt/mod.ts";
import { Checkbox } from "cliffy/prompt/checkbox.ts";
import type { JiraBoard, JiraFieldOption, JiraSprint } from "../api/jira.ts";
import { JiraClient } from "../api/jira.ts";
import type {
  CachedBoard,
  CachedIssue,
  CachedOption,
  CachedSprint,
  CacheState,
  JiraIssue,
} from "../types.ts";
import { loadConfig } from "../config.ts";
import { loadState, saveState } from "../state.ts";

interface NewOptions {
  project?: string;
  epic?: string;
  parent?: string;
  type?: string;
  summary?: string;
  description?: string;
  clientSow?: string;
  labels?: string;
  sprint?: string;
  noCache?: boolean;
}

const PARENT_REQUIRED_TYPES = new Set(["Task", "Sub-task"]);
const DEFAULT_CLIENT_SOW_FIELD_ID = "customfield_10200";
const DEFAULT_SPRINT_FIELD_ID = "customfield_10010";
const EPIC_NONE_VALUE = "__none__";
const SPRINT_NONE_VALUE = "__none__";

async function promptProject(
  projects?: Record<string, string>,
): Promise<string | undefined> {
  const entries = Object.entries(projects ?? {});

  if (entries.length === 0) {
    return await Input.prompt({
      message: "Project key",
      minLength: 1,
    });
  }

  const options = entries.map(([key, name]) => ({
    name: `${key} ${name}`,
    value: key,
  }));

  return await Select.prompt({
    message: "Project",
    options,
  });
}

function issueTypeRequiresParent(type?: string): boolean {
  if (!type) {
    return true;
  }

  return PARENT_REQUIRED_TYPES.has(type);
}

function parseLabels(input?: string): string[] | undefined {
  if (!input) {
    return undefined;
  }

  const labels = input
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return labels.length > 0 ? labels : undefined;
}

async function promptLabels(availableLabels: string[]): Promise<string[]> {
  if (availableLabels.length === 0) {
    const labelInput = await Input.prompt({
      message: "Labels (comma separated)",
      minLength: 1,
    });

    const labels = parseLabels(labelInput);
    if (!labels) {
      throw new Error("Labels are required.");
    }

    return labels;
  }

  const selection = await Checkbox.prompt({
    message: "Labels",
    options: availableLabels
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((label) => ({
        name: label,
        value: label,
      })),
    search: true,
  });

  if (!selection || selection.length === 0) {
    throw new Error("Labels are required.");
  }

  return selection;
}

function extractOptionValue(
  fieldValue: unknown,
): { id?: string; value?: string } | undefined {
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

function optionPayload(
  option: { id?: string; value?: string },
): Record<string, string> {
  if (option.id) {
    return { id: option.id };
  }

  if (option.value) {
    return { value: option.value };
  }

  return {};
}

async function promptClientSow(
  options: CachedOption[],
  defaultValue?: string,
): Promise<{ id?: string; value?: string }> {
  if (options.length === 0) {
    const value = await Input.prompt({
      message: "Client SOW",
      minLength: 1,
    });

    return { value };
  }

  const sortedOptions = [...options].sort((a, b) =>
    a.value.localeCompare(b.value)
  );
  const defaultOption = defaultValue
    ? sortedOptions.find((option) =>
      option.id === defaultValue || option.value === defaultValue
    )
    : undefined;

  const selection = await Select.prompt({
    message: "Client SOW",
    options: sortedOptions.map((option) => ({
      name: option.value,
      value: option.id,
    })),
    default: defaultOption?.id,
  });

  const selected = options.find((option) => option.id === selection);
  if (!selected) {
    return { value: selection };
  }

  return { id: selected.id, value: selected.value };
}

function normalizeBoardId(value?: number | string): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return undefined;
}

function parseSprintId(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return undefined;
}

function toCachedIssues(epics: JiraIssue[]): CachedIssue[] {
  return epics.map((epic) => ({ key: epic.key, summary: epic.summary }));
}

function toCachedOptions(options: JiraFieldOption[]): CachedOption[] {
  return options.map((option) => ({ id: option.id, value: option.value }));
}

function toCachedBoards(boards: JiraBoard[]): CachedBoard[] {
  return boards.map((board) => ({ id: board.id, name: board.name }));
}

function toCachedSprints(sprints: JiraSprint[]): CachedSprint[] {
  return sprints.map((sprint) => ({
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
  }));
}

async function promptSprintBoard(
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

  const selection = await Select.prompt({
    message: "Board",
    options: [
      { name: "None", value: SPRINT_NONE_VALUE },
      ...boards.map((board) => ({
        name: board.name,
        value: board.id.toString(),
      })),
    ],
  });

  if (selection === SPRINT_NONE_VALUE) {
    return undefined;
  }

  return Number(selection);
}

async function promptSprint(
  sprints: CachedSprint[],
  sprintName?: string,
): Promise<number | undefined> {
  if (sprints.length === 0) {
    if (sprintName) {
      throw new Error("No active sprints available for the board.");
    }

    return undefined;
  }

  if (sprintName) {
    const match = sprints.find((sprint) =>
      sprint.name.toLowerCase() === sprintName.toLowerCase()
    );

    if (!match) {
      throw new Error(`Active sprint "${sprintName}" not found.`);
    }

    return match.id;
  }

  const selection = await Select.prompt({
    message: "Sprint",
    options: [
      { name: "None", value: SPRINT_NONE_VALUE },
      ...sprints.map((sprint) => ({
        name: sprint.name,
        value: sprint.id.toString(),
      })),
    ],
  });

  if (selection === SPRINT_NONE_VALUE) {
    return undefined;
  }

  return Number(selection);
}

async function promptParentIssue(
  jira: JiraClient,
  projectKey: string,
  parentTypes: string[],
): Promise<string> {
  const typeLabel = parentTypes.join("/");
  const query = await Input.prompt({
    message: `Parent ${typeLabel} search (or enter key)`,
    minLength: 1,
  });

  if (/^[A-Z][A-Z0-9]+-\d+$/.test(query)) {
    return query;
  }

  const typesList = parentTypes.map((type) => `"${type}"`).join(", ");
  const jql =
    `project = ${projectKey} AND issuetype in (${typesList}) AND text ~ "${
      query.replace(/"/g, '\\"')
    }" ORDER BY updated DESC`;
  const matches = await jira.search(jql, 20);

  if (matches.length === 0) {
    throw new Error("No matching parent issues found.");
  }

  return await Select.prompt({
    message: `Select parent ${typeLabel}`,
    options: matches.map((issue) => ({
      name: `${issue.key} ${issue.summary}`,
      value: issue.key,
    })),
  });
}

export function registerNewCommand(program: Command): void {
  program
    .command("new [summary:string]")
    .description("Create a new Jira issue.")
    .option("--project <project:string>", "Project key")
    .option("--epic <epic:string>", "Epic key")
    .option("--parent <parent:string>", "Parent issue key")
    .option("--type <type:string>", "Issue type", { default: "Task" })
    .option("--summary <summary:string>", "Issue summary")
    .option("--description <description:string>", "Issue description")
    .option("--client-sow <clientSow:string>", "Client SOW")
    .option("--labels <labels:string>", "Labels (comma separated)")
    .option("--sprint <sprint:string>", "Sprint name or id")
    .option("--no-cache", "Disable cached Jira metadata")
    .action(async (options: NewOptions, summaryArg?: string) => {
      const config = await loadConfig();
      const jira = new JiraClient(config.jira);
      const state = await loadState();

      const projectKey = options.project ?? state.lastProject ??
        config.defaults?.project ??
        (await promptProject(config.projects)) ?? "";

      if (!projectKey) {
        throw new Error("Project key is required.");
      }

      const issueType = options.type ?? config.defaults?.issueType ?? "Task";
      const useCache = !options.noCache;
      const cache: CacheState = useCache
        ? { ...(state.cache ?? {}) }
        : state.cache ?? {};
      let epicKey = options.epic ?? state.lastEpic ?? config.defaults?.epic;

      if (!epicKey && issueType !== "Sub-task") {
        let cachedEpics = useCache ? cache.epics?.[projectKey] : undefined;

        if (!cachedEpics) {
          const epics = await jira.listEpics(projectKey);
          cachedEpics = toCachedIssues(epics);

          if (useCache) {
            cache.epics = { ...(cache.epics ?? {}), [projectKey]: cachedEpics };
          }
        }

        if (cachedEpics.length > 0) {
          epicKey = await Select.prompt({
            message: "Epic",
            search: true,
            options: [
              { name: "None", value: EPIC_NONE_VALUE },
              ...cachedEpics.map((epic) => ({
                name: `${epic.key} ${epic.summary}`,
                value: epic.key,
              })),
            ],
          });

          if (epicKey === EPIC_NONE_VALUE) {
            epicKey = undefined;
          }
        }
      }

      const summary = summaryArg ?? options.summary ??
        (await Input.prompt({
          message: "Summary",
          minLength: 1,
        }));

      if (!summary) {
        throw new Error("Summary is required.");
      }
      let parentKey = options.parent;
      if (!parentKey && issueTypeRequiresParent(issueType)) {
        const parentTypes = issueType === "Sub-task" ? ["Task"] : ["Story"];
        parentKey = await promptParentIssue(jira, projectKey, parentTypes);
      }

      const projectDefaults = config.defaults?.projects?.[projectKey];
      const fieldDefaults = projectDefaults?.fields;
      const clientSowFieldId = fieldDefaults?.clientSowFieldId ??
        DEFAULT_CLIENT_SOW_FIELD_ID;
      let parentFields: Record<string, unknown> = {};

      if (parentKey) {
        parentFields = await jira.getIssueFields(parentKey, [
          clientSowFieldId,
          "labels",
        ]);
      }

      const parentClientSow = extractOptionValue(
        parentFields[clientSowFieldId],
      );
      const parentLabels = Array.isArray(parentFields.labels)
        ? parentFields.labels.filter(
          (value): value is string => typeof value === "string",
        )
        : undefined;
      const labelsOverride = parseLabels(options.labels);
      let labels = labelsOverride ?? parentLabels ?? fieldDefaults?.labels;

      if (!labels || labels.length === 0) {
        let availableLabels = useCache ? cache.labels : undefined;

        if (!availableLabels) {
          availableLabels = await jira.listLabels();

          if (useCache) {
            cache.labels = availableLabels;
          }
        }

        labels = await promptLabels(availableLabels);
      }

      const clientSowOverride = options.clientSow;
      const defaultClientSow = clientSowOverride ?? parentClientSow?.id ??
        parentClientSow?.value ?? state.lastClientSow ??
        fieldDefaults?.clientSowValue;
      let clientSowPayload: Record<string, string> | undefined;
      let clientSowOptions = useCache
        ? cache.clientSowOptions?.[clientSowFieldId]
        : undefined;

      if (!clientSowOptions) {
        const optionsList = await jira.getFieldOptions(clientSowFieldId);
        clientSowOptions = toCachedOptions(optionsList);

        if (useCache) {
          cache.clientSowOptions = {
            ...(cache.clientSowOptions ?? {}),
            [clientSowFieldId]: clientSowOptions,
          };
        }
      }

      if (clientSowOverride) {
        const match = clientSowOptions.find((option) =>
          option.id === clientSowOverride || option.value === clientSowOverride
        );
        clientSowPayload = match
          ? { id: match.id }
          : { value: clientSowOverride };
      } else {
        clientSowPayload = optionPayload(
          await promptClientSow(clientSowOptions, defaultClientSow),
        );
      }

      const sprintFieldId = fieldDefaults?.sprintFieldId ??
        DEFAULT_SPRINT_FIELD_ID;
      const sprintOverride = options.sprint;
      const sprintIdOverride = parseSprintId(sprintOverride);
      const sprintNameOverride = sprintOverride && !sprintIdOverride
        ? sprintOverride
        : undefined;
      let sprintId = sprintIdOverride;

      if (!sprintId) {
        let availableBoards = useCache ? cache.boards?.[projectKey] : undefined;

        if (!availableBoards) {
          const boards = await jira.listBoards(projectKey);
          availableBoards = toCachedBoards(boards);

          if (useCache) {
            cache.boards = {
              ...(cache.boards ?? {}),
              [projectKey]: availableBoards,
            };
          }
        }

        const boardId = await promptSprintBoard(
          availableBoards,
          fieldDefaults?.sprintBoardId,
        );

        if (!boardId) {
          if (sprintNameOverride) {
            throw new Error(
              "Sprint name provided but no board available for selection.",
            );
          }
        } else {
          const boardKey = boardId.toString();
          let availableSprints = useCache
            ? cache.sprints?.[boardKey]
            : undefined;

          if (!availableSprints) {
            const sprints = await jira.listActiveSprints(boardId);
            availableSprints = toCachedSprints(sprints);

            if (useCache) {
              cache.sprints = {
                ...(cache.sprints ?? {}),
                [boardKey]: availableSprints,
              };
            }
          }

          sprintId = await promptSprint(availableSprints, sprintNameOverride);
        }
      }

      const customFields: Record<string, unknown> = {};
      if (clientSowPayload && Object.keys(clientSowPayload).length > 0) {
        customFields[clientSowFieldId] = clientSowPayload;
      }

      if (typeof sprintId === "number" && Number.isFinite(sprintId)) {
        customFields[sprintFieldId] = sprintId;
      }

      const issue = await jira.createIssue({
        projectKey,
        summary,
        issueType,
        description: options.description,
        parentKey: parentKey ?? epicKey,
        labels,
        customFields,
      });

      const nextClientSow = clientSowPayload?.id ?? clientSowPayload?.value ??
        defaultClientSow;

      await saveState({
        ...state,
        lastProject: projectKey,
        lastEpic: epicKey,
        lastIssueKey: issue.key,
        lastClientSow: nextClientSow ?? state.lastClientSow,
        cache: useCache ? cache : state.cache,
      });

      console.log(`Created ${issue.key}: ${issue.summary}`);
    });
}
