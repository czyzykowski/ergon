import { dirname, resolve } from "path/mod.ts";
import type { Command } from "cliffy/command/mod.ts";
import { JiraClient } from "../api/jira.ts";
import { loadConfig } from "../config.ts";
import { loadState } from "../state.ts";
import { timestamp } from "../timestamp.ts";
import type { Attachment } from "../types.ts";

interface AttachmentsOptions {
  json?: boolean;
  download?: string;
}

export function registerAttachmentsCommand(program: Command): void {
  program
    .command("attachments [issueKey:string] [...ids:string]")
    .description(
      "List an issue's attachments, or only those named by id; --download fetches them.",
    )
    .option(
      "--download <dir:string>",
      "Fetch the selected attachments into <dir> as <id>-<filename>",
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
      const attached = await jira.listAttachments(key);
      let attachments: Attachment[];

      if (options.download === undefined) {
        attachments = selectAttachments(attached, ids);
      } else {
        const downloads = selectAttachments(attached, ids, options.download);
        await downloadAttachments(
          downloads,
          (id) => jira.downloadAttachment(id),
        );
        attachments = downloads;
      }

      if (options.json) {
        console.log(JSON.stringify(attachments, null, 2));
        return;
      }

      console.log(renderAttachments(attachments));
    });
}

/** An Attachment selected for download, so its `path` is always set. */
export type Download = Attachment & { path: string };

/**
 * One at a time, each through a temp file beside its `path` renamed into place,
 * so a run that dies midway never leaves a truncated file under a final name.
 * Missing directories are created. An existing file is overwritten: an
 * Attachment never changes, so a re-run is idempotent and repairs an earlier
 * partial one.
 */
export async function downloadAttachments(
  downloads: Download[],
  fetchBytes: (id: string) => Promise<Uint8Array>,
): Promise<void> {
  for (const { id, path } of downloads) {
    await Deno.mkdir(dirname(path), { recursive: true });
    const bytes = await fetchBytes(id);
    // Not Deno.makeTempFile: it creates the file 0600, and that mode would
    // survive the rename.
    const tempPath = `${path}.${Date.now()}.tmp`;

    try {
      await Deno.writeFile(tempPath, bytes);
      await Deno.rename(tempPath, path);
    } catch (error) {
      await Deno.remove(tempPath).catch(() => {});
      throw error;
    }
  }
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
  const line = [
    attachment.id,
    humanSize(attachment.size),
    timestamp(attachment.created),
    attachment.author ?? "",
    attachment.filename,
  ].join("  ");

  return attachment.path ? `${line}  → ${attachment.path}` : line;
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
 *
 * Given a `dir`, each row also gets the absolute `path` it downloads to,
 * `<dir>/<id>-<safe name>`; without one, no row has a path.
 */
export function selectAttachments(
  attachments: Attachment[],
  ids: string[],
): Attachment[];
export function selectAttachments(
  attachments: Attachment[],
  ids: string[],
  dir: string,
): Download[];
export function selectAttachments(
  attachments: Attachment[],
  ids: string[],
  dir?: string,
): Attachment[] {
  const selected = narrowToIds(attachments, ids);
  if (dir === undefined) return selected;

  return selected.map((attachment) => ({
    ...attachment,
    path: resolve(dir, fileName(attachment)),
  }));
}

/**
 * Most filesystems cap a file name at 255 bytes. Holding `<id>-<name>` to 200
 * leaves room for the temp suffix a download adds, with margin to spare.
 */
const MAX_FILE_NAME_BYTES = 200;

/** `<id>-<safe name>`, cut to fit within `MAX_FILE_NAME_BYTES`. */
function fileName(attachment: Attachment): string {
  const prefix = `${attachment.id}-`;
  const name = safeName(attachment.filename);

  return prefix + fitName(name, MAX_FILE_NAME_BYTES - byteLength(prefix));
}

/**
 * `name` cut to `budget` UTF-8 bytes, keeping its extension so the file still
 * opens as what it is. Only the stem is cut, and only on a character boundary.
 * A suffix too long to be an extension is treated as part of the stem.
 */
function fitName(name: string, budget: number): string {
  if (byteLength(name) <= budget) return name;

  const dot = name.lastIndexOf(".");
  const suffix = dot > 0 ? name.slice(dot) : "";
  const extension = byteLength(suffix) <= budget / 2 ? suffix : "";
  const stem = name.slice(0, name.length - extension.length);

  return cutToBytes(stem, budget - byteLength(extension)) + extension;
}

/** The longest prefix of `text` that fits in `budget` UTF-8 bytes. */
function cutToBytes(text: string, budget: number): string {
  let cut = "";
  let used = 0;

  for (const char of text) {
    used += byteLength(char);
    if (used > budget) break;
    cut += char;
  }

  return cut;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Jira's filename is untrusted, so only what follows its last `/` or `\` is
 * kept, so no filename can reach outside the dir. A name that is then empty or
 * only dots says nothing about the file, so it becomes a fixed fallback. The id
 * prefix keeps the result unique either way.
 */
function safeName(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "";

  return /^\.*$/.test(base) ? "attachment" : base;
}

function narrowToIds(attachments: Attachment[], ids: string[]): Attachment[] {
  if (ids.length === 0) return attachments;

  const attached = new Set(attachments.map((attachment) => attachment.id));
  const unknown = ids.filter((id) => !attached.has(id));
  if (unknown.length > 0) {
    throw new Error(`Not attached to this issue: ${unknown.join(", ")}.`);
  }

  const wanted = new Set(ids);
  return attachments.filter((attachment) => wanted.has(attachment.id));
}
