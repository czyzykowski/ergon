import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import { loadState } from "../state.ts";
import type { Attachment } from "../types.ts";
import { timestamp } from "./comments.ts";

interface AttachmentsOptions {
  json?: boolean;
}

export function registerAttachmentsCommand(program: Command): void {
  program
    .command("attachments [issueKey:string] [...ids:string]")
    .description(
      "List an issue's attachments, or only those named by id.",
    )
    .option("--json", "Output raw JSON")
    .action(async (
      options: AttachmentsOptions,
      issueKey?: string,
      ...ids: string[]
    ) => {
      const config = await loadConfig();
      const state = await loadState();
      const key = issueKey ?? state.lastIssueKey;

      if (!key) {
        throw new Error("Provide an issue key or run from a previous issue.");
      }

      const jira = new JiraClient(config.jira, config.defaults?.projects);
      const attachments = selectAttachments(
        await jira.listAttachments(key),
        ids,
      );

      if (options.json) {
        console.log(JSON.stringify(attachments, null, 2));
        return;
      }

      console.log(renderAttachments(attachments));
    });
}

/**
 * One line per Attachment. The filename goes last because it is the only field
 * that can contain spaces, so everything before it stays splittable. A hidden
 * author leaves its column empty rather than shifting the filename into it.
 */
export function renderAttachments(attachments: Attachment[]): string {
  if (attachments.length === 0) return "No attachments found.";

  return attachments.map(renderAttachment).join("\n");
}

function renderAttachment(attachment: Attachment): string {
  return [
    attachment.id,
    humanSize(attachment.size),
    timestamp(attachment.created),
    attachment.author ?? "",
    attachment.filename,
  ].join("  ");
}

/**
 * Rounded, base 1024. The unit is chosen after rounding, so a size just short
 * of a megabyte reads `1 MB` rather than `1024 KB`. The exact byte count is in
 * `--json`.
 */
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const kilobytes = Math.round(bytes / 1024);
  if (kilobytes < 1024) return `${kilobytes} KB`;

  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/**
 * The Attachments named by `ids`, or every one when none are named, always in
 * Jira's order. Ids are resolved against the issue's own list, and any that is
 * not on it refuses the whole selection, naming each unknown id, so an id
 * copied from the wrong issue fails loudly rather than half-succeeding.
 */
export function selectAttachments(
  attachments: Attachment[],
  ids: string[],
): Attachment[] {
  if (ids.length === 0) return attachments;

  const attached = new Set(attachments.map((attachment) => attachment.id));
  const unknown = ids.filter((id) => !attached.has(id));
  if (unknown.length > 0) {
    throw new Error(`Not attached to this issue: ${unknown.join(", ")}.`);
  }

  const wanted = new Set(ids);
  return attachments.filter((attachment) => wanted.has(attachment.id));
}
