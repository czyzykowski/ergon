import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import {
  BLOCKED_BY,
  createLinkBody,
  DUPLICATES,
  findLink,
  type LinkKind,
} from "../links.ts";
import { loadState } from "../state.ts";

interface LinkOptions {
  remove?: boolean;
}

export function registerLinkCommands(program: Command): void {
  program
    .command("blocked-by <first:string> [second:string]")
    .description(
      "Link an issue as blocked by another (blocked-by [ISSUE] BLOCKER).",
    )
    .option("--remove", "Remove the link instead of adding it")
    .action((options: LinkOptions, first: string, second?: string) =>
      link(BLOCKED_BY, options, first, second)
    );

  program
    .command("duplicates <first:string> [second:string]")
    .description(
      "Link an issue as duplicating another (duplicates [ISSUE] ORIGINAL).",
    )
    .option("--remove", "Remove the link instead of adding it")
    .action((options: LinkOptions, first: string, second?: string) =>
      link(DUPLICATES, options, first, second)
    );
}

async function link(
  kind: LinkKind,
  options: LinkOptions,
  first: string,
  second?: string,
): Promise<void> {
  const config = await loadConfig();
  const [subject, target] = await resolveIssues(first, second);
  const jira = new JiraClient(config.jira, config.defaults?.projects);
  const existing = findLink(await jira.getIssueLinks(subject), kind, target);

  if (options.remove) {
    if (!existing) {
      console.log(`${subject} ${kind.absentPhrase} ${target}`);
      return;
    }

    await jira.deleteIssueLink(existing.id);
    console.log(`Unlinked ${subject}: ${kind.phrase} ${target}`);
    return;
  }

  if (existing) {
    console.log(`${subject} ${kind.alreadyPhrase} ${target}`);
    return;
  }

  // Read the target before writing, so a mistyped key names itself rather than
  // arriving as Jira's 404, which cannot say which issue it meant.
  const summary = await jira.getIssueSummary(target);

  await jira.createIssueLink(createLinkBody(kind, subject, target));
  console.log(`Linked ${subject}: ${kind.phrase} ${target} (${summary})`);
}

/**
 * One key is the target, and the subject is the issue last worked on; two are
 * the subject and the target in that order.
 */
async function resolveIssues(
  first: string,
  second?: string,
): Promise<[string, string]> {
  if (second) return [first, second];

  const state = await loadState();

  if (!state.lastIssueKey) {
    throw new Error("Provide an issue key or run from a previous issue.");
  }

  return [state.lastIssueKey, first];
}
