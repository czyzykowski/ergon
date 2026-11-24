import { Input, Select } from "cliffy/prompt/mod.ts";
import { Checkbox } from "cliffy/prompt/checkbox.ts";
import type { JiraSprint } from "../api/jira.ts";
import type {
  CachedBoard,
  CachedIssue,
  CachedOption,
  ClientSowValue,
  JiraIssue,
} from "../types.ts";
import { parseLabels } from "./new_issue.ts";

/**
 * Every question `ergon new` asks, one method each. A method takes the domain
 * values it chooses among and answers with a domain value; "None" in a select
 * comes back as `undefined`.
 */
export interface Prompter {
  /** A project key, chosen from the configured projects or typed. */
  project(projects?: Record<string, string>): Promise<string>;
  /** The Epic to file under, or `undefined` for none. */
  epic(epics: CachedIssue[]): Promise<string | undefined>;
  summary(): Promise<string>;
  /** A Parent's key, or text to search the given issue types for. */
  parentQuery(types: string[]): Promise<string>;
  /** The Parent picked from a search's matches, of the given issue types. */
  parent(
    matches: Pick<JiraIssue, "key" | "summary">[],
    types: string[],
  ): Promise<string>;
  /** At least one label, picked from those available or typed. */
  labels(available: string[]): Promise<string[]>;
  /** A Client SOW, picked from the field's options or typed. */
  clientSow(
    options: CachedOption[],
    defaultValue?: string,
  ): Promise<ClientSowValue>;
  /** The board whose Sprints to offer, or `undefined` for none. */
  board(boards: CachedBoard[]): Promise<number | undefined>;
  /** The Sprint to file into, or `undefined` for none. */
  sprint(
    sprints: Pick<JiraSprint, "id" | "name">[],
  ): Promise<number | undefined>;
}

// Only ever a select's value here: callers get `undefined` instead.
const NONE_VALUE = "__none__";

function parentTypeLabel(types: string[]): string {
  return types.join("/");
}

/** Asks at the terminal: the Prompter of an Interactive run. */
export const cliffyPrompter: Prompter = {
  async project(projects) {
    const entries = Object.entries(projects ?? {});

    if (entries.length === 0) {
      return await Input.prompt({ message: "Project key", minLength: 1 });
    }

    return await Select.prompt({
      message: "Project",
      options: entries.map(([key, name]) => ({
        name: `${key} ${name}`,
        value: key,
      })),
    });
  },

  async epic(epics) {
    const selection = await Select.prompt({
      message: "Epic",
      search: true,
      options: [
        { name: "None", value: NONE_VALUE },
        ...epics.map((epic) => ({
          name: `${epic.key} ${epic.summary}`,
          value: epic.key,
        })),
      ],
    });

    return selection === NONE_VALUE ? undefined : selection;
  },

  async summary() {
    return await Input.prompt({ message: "Summary", minLength: 1 });
  },

  async parentQuery(types) {
    return await Input.prompt({
      message: `Parent ${parentTypeLabel(types)} search (or enter key)`,
      minLength: 1,
    });
  },

  async parent(matches, types) {
    return await Select.prompt({
      message: `Select parent ${parentTypeLabel(types)}`,
      options: matches.map((issue) => ({
        name: `${issue.key} ${issue.summary}`,
        value: issue.key,
      })),
    });
  },

  async labels(available) {
    if (available.length === 0) {
      const labels = parseLabels(
        await Input.prompt({
          message: "Labels (comma separated)",
          minLength: 1,
        }),
      );

      if (!labels) {
        throw new Error("Labels are required.");
      }

      return labels;
    }

    const selection = await Checkbox.prompt({
      message: "Labels",
      options: available
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .map((label) => ({ name: label, value: label })),
      search: true,
    });

    if (!selection || selection.length === 0) {
      throw new Error("Labels are required.");
    }

    return selection;
  },

  async clientSow(options, defaultValue) {
    if (options.length === 0) {
      return {
        value: await Input.prompt({ message: "Client SOW", minLength: 1 }),
      };
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

    return selected
      ? { id: selected.id, value: selected.value }
      : { value: selection };
  },

  async board(boards) {
    const selection = await Select.prompt({
      message: "Board",
      options: [
        { name: "None", value: NONE_VALUE },
        ...boards.map((board) => ({
          name: board.name,
          value: board.id.toString(),
        })),
      ],
    });

    return selection === NONE_VALUE ? undefined : Number(selection);
  },

  async sprint(sprints) {
    const selection = await Select.prompt({
      message: "Sprint",
      options: [
        { name: "None", value: NONE_VALUE },
        ...sprints.map((sprint) => ({
          name: sprint.name,
          value: sprint.id.toString(),
        })),
      ],
    });

    return selection === NONE_VALUE ? undefined : Number(selection);
  },
};

function neverAsked(method: keyof Prompter): () => Promise<never> {
  return () =>
    Promise.reject(
      new Error(
        `Bug: a Non-interactive run reached Prompter.${method}(). A Non-interactive run never prompts (docs/adr/0014); flags, the Parent or config must settle this first.`,
      ),
    );
}

/**
 * The Prompter of a Non-interactive run. Every Non-interactive path is settled
 * by flags, the Parent or config before a question would be asked, so any call
 * here is a bug, and fails loudly rather than hang on a missing terminal.
 */
export const nonInteractivePrompter: Prompter = {
  project: neverAsked("project"),
  epic: neverAsked("epic"),
  summary: neverAsked("summary"),
  parentQuery: neverAsked("parentQuery"),
  parent: neverAsked("parent"),
  labels: neverAsked("labels"),
  clientSow: neverAsked("clientSow"),
  board: neverAsked("board"),
  sprint: neverAsked("sprint"),
};
