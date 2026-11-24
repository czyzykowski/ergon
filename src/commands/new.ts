import type { Command } from "cliffy/command/mod.ts";
import type { JiraSprint } from "../api/jira.ts";
import { JiraClient } from "../api/jira.ts";
import type { CachedBoard } from "../types.ts";
import { loadConfig, requireDeclaredProject } from "../config.ts";
import { isInteractive } from "../interactive.ts";
import {
  isActiveSprintKeyword,
  normalizeBoardId,
  requireSprintFieldId,
  resolveSprintId,
  sprintsHint,
} from "../sprint.ts";
import { loadState, saveState } from "../state.ts";
import {
  assertExpressible,
  omitIfBlank,
  planSource,
  readSource,
} from "../text_source.ts";
import {
  assigneeField,
  optionPayload,
  parentFieldsFrom,
  parseAssignee,
  rememberCreated,
  requireClientSowFieldId,
  resolveFields,
} from "./new_fields.ts";
import { CachedJira, type NewIssueJira } from "./new_jira.ts";
import {
  cliffyPrompter,
  nonInteractivePrompter,
  type Prompter,
} from "./new_prompter.ts";

interface NewOptions {
  project?: string;
  epic?: string;
  parent?: string;
  type?: string;
  summary?: string;
  description?: string;
  descriptionFile?: string;
  clientSow?: string;
  labels?: string;
  sprint?: string;
  assignee?: string;
  noCache?: boolean;
  nonInteractive?: boolean;
}

const PARENT_REQUIRED_TYPES = new Set(["Task", "Sub-task"]);
const EPIC_NONE_VALUE = "__none__";
function issueTypeRequiresParent(type?: string): boolean {
  if (!type) {
    return true;
  }

  return PARENT_REQUIRED_TYPES.has(type);
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

/**
 * The Active Sprint named by --sprint, or else the one the person picks; none
 * when the board has no Active Sprint and no name was given.
 */
async function chooseSprint(
  prompter: Prompter,
  projectKey: string,
  sprints: JiraSprint[],
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
      throw new Error(
        `Active sprint "${sprintName}" not found. ${sprintsHint(projectKey)}`,
      );
    }

    return match.id;
  }

  return await prompter.sprint(sprints);
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
  const jql =
    `project = ${projectKey} AND issuetype in (${typesList}) AND text ~ "${
      query.replace(/"/g, '\\"')
    }" ORDER BY updated DESC`;
  const matches = await jira.search(jql, 20);

  if (matches.length === 0) {
    throw new Error("No matching parent issues found.");
  }

  return await prompter.parent(matches, parentTypes);
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
    .option(
      "--description <description:string>",
      "Issue description, or '-' to read it from stdin",
    )
    .option(
      "--description-file <descriptionFile:string>",
      "Read the issue description from this file, or from stdin for '-'",
    )
    .option("--client-sow <clientSow:string>", "Client SOW")
    .option(
      "--labels <labels:string>",
      "Labels (comma separated); 'none' to create the issue unlabelled",
    )
    .option(
      "--sprint <sprint:string>",
      "Sprint id, or an active sprint's name ('ergon sprints <project>' lists them); 'active' for the active sprint, 'none' to skip",
    )
    .option(
      "--assignee <assignee:string>",
      "'me' to assign the issue to yourself, 'none' to create it unassigned; left out, the project's default applies",
    )
    .option("--no-cache", "Disable cached Jira metadata")
    .option(
      "--non-interactive",
      "Never prompt, as every run without a terminal already is. Client SOW and labels are inherited from the parent (or the epic), then from project config; remembered state is ignored. Use 'none' as a value to explicitly clear --epic/--labels/--client-sow/--sprint.",
    )
    .action(async (options: NewOptions, summaryArg?: string) => {
      const config = await loadConfig();
      const client = new JiraClient(config.jira, config.defaults?.projects);
      const state = await loadState();
      // --no-cache asks Jira every time and leaves the saved Cache as it was.
      const cachedJira = options.noCache
        ? undefined
        : new CachedJira(client, state.cache);
      const jira: NewIssueJira = cachedJira ?? client;

      const interactive = isInteractive(options);
      const prompter = interactive ? cliffyPrompter : nonInteractivePrompter;

      // Settled and read before the first prompt and the first Jira call: a
      // typo'd path, an empty file or a construct ergon cannot write costs an
      // error rather than six answered prompts and two round-trips.
      const subject = "Description";
      const descriptionSource = planSource({
        inline: options.description,
        file: options.descriptionFile,
        flag: "--description",
        fileFlag: "--description-file",
        subject,
        interactive,
      });
      let description: string | undefined;

      if (descriptionSource) {
        description = await readSource(descriptionSource, { subject });
        assertExpressible(description, descriptionSource);
      }

      // Refused here for the same reason as a bad Description source.
      const assigneeTarget = options.assignee === undefined
        ? undefined
        : parseAssignee(options.assignee);

      // Remembered state pre-selects a human's next answer, so a
      // Non-interactive run neither reads nor writes it — see docs/adr/0001.
      let projectKey = options.project ??
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

      const issueType = options.type ?? config.defaults?.issueType ?? "Task";
      const epicNone = options.epic?.trim().toLowerCase() === "none" ||
        options.epic === EPIC_NONE_VALUE;
      let epicKey = epicNone ? undefined : (options.epic ??
        (interactive ? state.lastEpic : undefined) ?? config.defaults?.epic);

      if (!epicKey && !epicNone && issueType !== "Sub-task" && interactive) {
        const epics = await jira.listEpics(projectKey);

        if (epics.length > 0) {
          epicKey = await prompter.epic(epics);
        }
      }

      const summary = summaryArg ?? options.summary ??
        (interactive ? await prompter.summary() : undefined);

      if (!summary) {
        throw new Error("Summary is required; pass --summary.");
      }
      let parentKey = options.parent;
      if (!parentKey && issueTypeRequiresParent(issueType) && interactive) {
        const parentTypes = issueType === "Sub-task" ? ["Task"] : ["Story"];
        parentKey = await askParentIssue(
          prompter,
          jira,
          projectKey,
          parentTypes,
        );
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
        labels = await prompter.labels(await jira.listLabels());
      }

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
        const clientSowOptions = await jira.getFieldOptions(sowFieldId);

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
            await prompter.clientSow(clientSowOptions, clientSowPlan.default),
          );
        }
      }

      const sprintOverride = options.sprint;
      const sprintKeyword = sprintOverride?.trim().toLowerCase();
      const sprintNone = sprintKeyword === "none";
      const sprintActive = sprintOverride !== undefined &&
        isActiveSprintKeyword(sprintOverride);
      const sprintIdOverride = parseSprintId(sprintOverride);
      const sprintNameOverride =
        sprintOverride && !sprintIdOverride && !sprintNone && !sprintActive
          ? sprintOverride
          : undefined;
      let sprintId = sprintIdOverride;

      if (sprintActive) {
        // Boards straight from Jira: the cached ones carry no board type.
        sprintId = await resolveSprintId({
          projectKey,
          jira,
          boards: await client.listBoards(projectKey),
          configuredBoardId: fieldDefaults?.sprintBoardId,
        });
      }

      // Resolve a sprint when it isn't already settled. In non-interactive
      // mode this only runs for --sprint by name (a plain absence leaves the
      // sprint unset).
      if (
        !sprintId && !sprintNone &&
        (interactive || sprintNameOverride)
      ) {
        if (!interactive && sprintNameOverride) {
          throw new Error(
            "Resolving --sprint by name needs interactive mode; pass a numeric sprint id or 'active'.",
          );
        }

        const boardId = await chooseSprintBoard(
          prompter,
          await jira.listBoards(projectKey),
          fieldDefaults?.sprintBoardId,
        );

        if (!boardId) {
          if (sprintNameOverride) {
            throw new Error("No board available to resolve the sprint.");
          }
        } else {
          // Never cached: an active Sprint is a fact with a shelf life.
          sprintId = await chooseSprint(
            prompter,
            projectKey,
            await jira.listActiveSprints(boardId),
            sprintNameOverride,
          );
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
        customFields[
          requireSprintFieldId(fieldDefaults?.sprintFieldId, projectKey)
        ] = sprintId;
      }

      const assignee = assigneeTarget
        ? await assigneeField(assigneeTarget, () => jira.getMyAccountId())
        : undefined;

      const issue = await jira.createIssue({
        projectKey,
        summary,
        issueType,
        description: omitIfBlank(description),
        parentKey: parentKey ?? epicKey,
        labels,
        assignee,
        customFields,
      });

      await saveState({
        ...rememberCreated(state, {
          projectKey,
          epicKey,
          issueKey: issue.key,
          clientSow: clientSowPayload?.id ?? clientSowPayload?.value,
        }, interactive),
        cache: cachedJira?.cache ?? state.cache,
      });

      console.log(`Created ${issue.key}: ${summary}`);
    });
}
