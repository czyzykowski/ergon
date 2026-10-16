import { Command } from "cliffy/command/mod.ts";
import { ConfigError } from "./config.ts";
import { registerAttachmentsCommand } from "./commands/attachments.ts";
import { registerClientSowsCommand } from "./commands/client_sows.ts";
import { registerCommentCommand } from "./commands/comment.ts";
import { registerCommentsCommand } from "./commands/comments.ts";
import { registerEditCommand } from "./commands/edit.ts";
import { registerGetCommand } from "./commands/get.ts";
import { registerLabelsCommand } from "./commands/labels.ts";
import { registerLinkCommands } from "./commands/link.ts";
import { registerLogCommand } from "./commands/log.ts";
import { registerLsCommand } from "./commands/ls.ts";
import { registerMenuCommand } from "./commands/menu.ts";
import { registerNewCommand } from "./commands/new.ts";
import { registerMoveCommand } from "./commands/move.ts";
import { registerOpenCommand } from "./commands/open.ts";
import { registerSearchCommand } from "./commands/search.ts";
import { registerSprintsCommand } from "./commands/sprints.ts";
import { registerStartCommand } from "./commands/start.ts";
import { registerStatusCommand } from "./commands/status.ts";
import { registerStopCommand } from "./commands/stop.ts";
import { registerUnlogCommand } from "./commands/unlog.ts";
import { registerWorklogsCommand } from "./commands/worklogs.ts";

export const MAIN_DESCRIPTION = "CLI for Jira + Clockwork workflows.";

export function buildCommand(): Command {
  const program = new Command()
    .name("ergon")
    .version("0.1.0")
    .description(MAIN_DESCRIPTION)
    // ergon is read mostly by scripts and agents, so help carries no escape
    // codes. Subcommands inherit this.
    .help({ colors: false })
    // Usage errors reach main's catch as one line, rather than cliffy printing
    // the whole help to stdout ahead of them.
    .throwErrors();

  registerNewCommand(program);
  registerStartCommand(program);
  registerStopCommand(program);
  registerStatusCommand(program);
  registerLogCommand(program);
  registerWorklogsCommand(program);
  registerUnlogCommand(program);
  registerLsCommand(program);
  registerGetCommand(program);
  registerLabelsCommand(program);
  registerClientSowsCommand(program);
  registerSprintsCommand(program);
  registerCommentCommand(program);
  registerCommentsCommand(program);
  registerAttachmentsCommand(program);
  registerSearchCommand(program);
  registerOpenCommand(program);
  registerMoveCommand(program);
  registerEditCommand(program);
  registerLinkCommands(program);
  registerMenuCommand(program);

  return program;
}

export async function main(): Promise<void> {
  try {
    await buildCommand().parse(Deno.args);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      Deno.exit(1);
    }

    if (error instanceof Error) {
      console.error(error.message);
      Deno.exit(1);
    }

    throw error;
  }
}

if (import.meta.main) {
  await main();
}
