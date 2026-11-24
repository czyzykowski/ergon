import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../../api/jira.ts";
import { loadConfig, requireDeclaredProject } from "../../config.ts";
import { localDay } from "../../dates.ts";
import {
  boardLabel,
  listOpenSprints,
  type OpenSprint,
  scrumBoards,
} from "../../sprint.ts";

interface SprintsOptions {
  json?: boolean;
}

export function registerSprintsCommand(program: Command): void {
  program
    .command("sprints <projectKey:string>")
    .description(
      "List a project's open sprints — active, then upcoming — with the ids --sprint accepts.",
    )
    .option("--json", "Output raw JSON")
    .action(async (options: SprintsOptions, projectKey: string) => {
      const config = await loadConfig();
      requireDeclaredProject(config.defaults?.projects, projectKey);

      const jira = new JiraClient(config.jira, config.defaults?.projects);
      // Deliberately uncached, like the Active Sprint: which Sprints are open
      // changes the moment someone starts or completes one.
      const boards = scrumBoards(await jira.listBoards(projectKey), projectKey);
      const sprints = await listOpenSprints({ jira, boards });

      if (options.json) {
        console.log(JSON.stringify(sprints, null, 2));
        return;
      }

      console.log(renderSprints(sprints, boards));
    });
}

/**
 * The Open Sprints as they read in a terminal. The id leads because it is the
 * column copied into `--sprint`; dates are the operator's local day, since a
 * Sprint starting 04:00 UTC on a Monday starts on Monday where they are.
 */
export function renderSprints(
  sprints: readonly OpenSprint[],
  boards: readonly { id: number; name: string }[],
): string {
  if (sprints.length === 0) {
    return `No open sprints on ${boards.map(boardLabel).join(", ")}.`;
  }

  const header = ["ID", "STATE", "NAME", "START", "END", "BOARDS"];
  const rows = [
    header,
    ...sprints.map((sprint) => [
      String(sprint.id),
      sprint.state,
      sprint.name,
      day(sprint.startDate),
      day(sprint.endDate),
      sprint.boards.map(boardLabel).join(", "),
    ]),
  ];
  const widths = header.map((_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0))
  );

  return rows
    .map((row) =>
      row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ")
        .trimEnd()
    )
    .join("\n");
}

function day(instant: string | null): string {
  return instant === null ? "—" : localDay(new Date(instant));
}
