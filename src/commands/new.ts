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
import {
  optionPayload,
  parentFieldsFrom,
  parseLabels,
  requireClientSowFieldId,
  resolveFields,
} from "./new_fields.ts";

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
  nonInteractive?: boolean;
}

const PARENT_REQUIRED_TYPES = new Set(["Task", "Sub-task"]);
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
    .option(
      "--labels <labels:string>",
      "Labels (comma separated); 'none' to create the issue unlabelled",
    )
    .option(
      "--sprint <sprint:string>",
      "Sprint name or id; 'current' (or 'active') for the board's active sprint, 'none' to skip",
    )
    .option("--no-cache", "Disable cached Jira metadata")
    .option(
      "--non-interactive",
      "Never prompt. Client SOW and labels are inherited from the parent (or the epic), then from project config; remembered state is ignored. Use 'none' as a value to explicitly clear --epic/--labels/--client-sow/--sprint.",
    )
    .action(async (options: NewOptions, summaryArg?: string) => {
      const config = await loadConfig();
      const jira = new JiraClient(config.jira);
      const state = await loadState();

      const interactive = !options.nonInteractive;

      let projectKey = options.project ?? state.lastProject ??
        config.defaults?.project ?? "";
      if (!projectKey && interactive) {
        projectKey = (await promptProject(config.projects)) ?? "";
      }

      if (!projectKey) {
        throw new Error("Project key is required.");
      }

      const issueType = options.type ?? config.defaults?.issueType ?? "Task";
      const useCache = !options.noCache;
      const cache: CacheState = useCache
        ? { ...(state.cache ?? {}) }
        : state.cache ?? {};
      const epicNone = options.epic?.trim().toLowerCase() === "none" ||
        options.epic === EPIC_NONE_VALUE;
      let epicKey = epicNone ? undefined : (options.epic ??
        (interactive ? state.lastEpic : undefined) ?? config.defaults?.epic);

      if (!epicKey && !epicNone && issueType !== "Sub-task" && interactive) {
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
        (interactive
          ? await Input.prompt({
            message: "Summary",
            minLength: 1,
          })
          : undefined);

      if (!summary) {
        throw new Error("Summary is required.");
      }
      let parentKey = options.parent;
      if (!parentKey && issueTypeRequiresParent(issueType) && interactive) {
        const parentTypes = issueType === "Sub-task" ? ["Task"] : ["Story"];
        parentKey = await promptParentIssue(jira, projectKey, parentTypes);
      }

      const projectDefaults = config.defaults?.projects?.[projectKey];
      const fieldDefaults = projectDefaults?.fields;
      const clientSowFieldId = fieldDefaults?.clientSowFieldId;
      // Interactive runs only inherit from an explicit --parent. Non-interactive
      // runs also inherit from the epic, which becomes this issue's parent when
      // no --parent was given.
      const inheritFromKey = parentKey ?? (interactive ? undefined : epicKey);
      const parentValues = inheritFromKey
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
        labelsOption: options.labels,
        clientSowOption: options.clientSow,
        parent: parentValues,
        fieldDefaults,
        lastClientSow: state.lastClientSow,
      });

      let labels = resolved.labels;

      if (resolved.needsLabelPrompt) {
        let availableLabels = useCache ? cache.labels : undefined;

        if (!availableLabels) {
          availableLabels = await jira.listLabels();

          if (useCache) {
            cache.labels = availableLabels;
          }
        }

        labels = await promptLabels(availableLabels);
      }

      const loadClientSowOptions = async (
        fieldId: string,
      ): Promise<CachedOption[]> => {
        const cached = useCache ? cache.clientSowOptions?.[fieldId] : undefined;

        if (cached) {
          return cached;
        }

        const options = toCachedOptions(
          await jira.getFieldOptions(fieldId),
        );

        if (useCache) {
          cache.clientSowOptions = {
            ...(cache.clientSowOptions ?? {}),
            [fieldId]: options,
          };
        }

        return options;
      };

      const clientSowPlan = resolved.clientSow;
      // Undefined only when the plan is "skip"; anything else throws here rather
      // than settle a Client SOW against a field the project never declared.
      const sowFieldId = requireClientSowFieldId(
        clientSowPlan,
        clientSowFieldId,
        projectKey,
      );
      let clientSowPayload: Record<string, string> | undefined;

      if (clientSowPlan.kind === "payload") {
        // Inherited values arrive with their option id attached, so they need
        // no lookup against the field's options.
        clientSowPayload = clientSowPlan.payload;
      } else if (sowFieldId) {
        // Both remaining kinds — lookup and prompt — settle against the options.
        const clientSowOptions = await loadClientSowOptions(sowFieldId);

        if (clientSowPlan.kind === "lookup") {
          const match = clientSowOptions.find((option) =>
            option.id === clientSowPlan.value ||
            option.value === clientSowPlan.value
          );
          clientSowPayload = match
            ? { id: match.id }
            : { value: clientSowPlan.value };
        } else if (clientSowPlan.kind === "prompt") {
          clientSowPayload = optionPayload(
            await promptClientSow(clientSowOptions, clientSowPlan.default),
          );
        }
      }

      const sprintFieldId = fieldDefaults?.sprintFieldId ??
        DEFAULT_SPRINT_FIELD_ID;
      const sprintOverride = options.sprint;
      const sprintKeyword = sprintOverride?.trim().toLowerCase();
      const sprintNone = sprintKeyword === "none";
      const sprintCurrent = sprintKeyword === "current" ||
        sprintKeyword === "active";
      const sprintIdOverride = parseSprintId(sprintOverride);
      const sprintNameOverride =
        sprintOverride && !sprintIdOverride && !sprintNone && !sprintCurrent
          ? sprintOverride
          : undefined;
      let sprintId = sprintIdOverride;

      // Resolve a sprint when it isn't already a numeric id or an explicit
      // 'none'. In non-interactive mode this only runs for --sprint by name or
      // --sprint current/active (a plain absence leaves the sprint unset).
      if (
        !sprintId && !sprintNone &&
        (interactive || sprintNameOverride || sprintCurrent)
      ) {
        if (!interactive && sprintNameOverride) {
          throw new Error(
            "Resolving --sprint by name needs interactive mode; pass a numeric sprint id or 'current'.",
          );
        }

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

        let boardId: number | undefined;
        if (sprintCurrent) {
          // 'current' just needs any board's active sprint; don't prompt.
          boardId = normalizeBoardId(fieldDefaults?.sprintBoardId) ??
            availableBoards[0]?.id;
        } else {
          if (
            !interactive && !normalizeBoardId(fieldDefaults?.sprintBoardId) &&
            availableBoards.length > 1
          ) {
            throw new Error(
              "Multiple boards found; set a default sprintBoardId or pass a numeric --sprint id.",
            );
          }
          boardId = await promptSprintBoard(
            availableBoards,
            fieldDefaults?.sprintBoardId,
          );
        }

        if (!boardId) {
          if (sprintNameOverride || sprintCurrent) {
            throw new Error(
              "No board available to resolve the sprint.",
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

          if (sprintCurrent) {
            if (availableSprints.length === 0) {
              throw new Error("No active sprint found for the board.");
            }
            const current = availableSprints[0];
            sprintId = current.id;
            console.error(
              `Using active sprint: ${current.name} (${current.id})`,
            );
          } else {
            sprintId = await promptSprint(availableSprints, sprintNameOverride);
          }
        }
      }

      const customFields: Record<string, unknown> = {};
      if (
        sowFieldId && clientSowPayload &&
        Object.keys(clientSowPayload).length > 0
      ) {
        customFields[sowFieldId] = clientSowPayload;
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

      const nextClientSow = clientSowPayload?.id ?? clientSowPayload?.value;

      await saveState({
        ...state,
        lastProject: projectKey,
        lastEpic: epicKey,
        lastIssueKey: issue.key,
        // The remembered SOW records what a human picked at the prompt, so a
        // non-interactive run must not overwrite it — see docs/adr/0001.
        lastClientSow: interactive
          ? nextClientSow ?? state.lastClientSow
          : state.lastClientSow,
        cache: useCache ? cache : state.cache,
      });

      console.log(`Created ${issue.key}: ${issue.summary}`);
    });
}
