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
    .command("attachments [issueKey:string]")
    .description("List an issue's attachments.")
    .option("--json", "Output raw JSON")
    .action(async (options: AttachmentsOptions, issueKey?: string) => {
      const config = await loadConfig();
      const state = await loadState();
      const key = issueKey ?? state.lastIssueKey;

      if (!key) {
        throw new Error("Provide an issue key or run from a previous issue.");
      }

      const jira = new JiraClient(config.jira, config.defaults?.projects);
      const attachments = await jira.listAttachments(key);

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
