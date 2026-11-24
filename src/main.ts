import { Command } from "cliffy/command/mod.ts";
import { ConfigError } from "./config.ts";
import { registerAttachmentsCommand } from "./commands/attachments/mod.ts";
import { registerClientSowsCommand } from "./commands/client_sows/mod.ts";
import { registerCommentCommand } from "./commands/comment/mod.ts";
import { registerCommentsCommand } from "./commands/comments/mod.ts";
import { registerEditCommand } from "./commands/edit/mod.ts";
import { registerGetCommand } from "./commands/get/mod.ts";
import { registerLabelsCommand } from "./commands/labels/mod.ts";
import { registerLinkCommands } from "./commands/link/mod.ts";
import { registerLogCommand } from "./commands/log/mod.ts";
import { registerLsCommand } from "./commands/ls/mod.ts";
import { registerMenuCommand } from "./commands/menu/mod.ts";
import { registerNewCommand } from "./commands/new/mod.ts";
import { registerMoveCommand } from "./commands/move/mod.ts";
import { registerOpenCommand } from "./commands/open/mod.ts";
import { registerSearchCommand } from "./commands/search/mod.ts";
import { registerSprintsCommand } from "./commands/sprints/mod.ts";
import { registerStartCommand } from "./commands/start/mod.ts";
import { registerStatusCommand } from "./commands/status/mod.ts";
import { registerStopCommand } from "./commands/stop/mod.ts";
import { registerUnlogCommand } from "./commands/unlog/mod.ts";
import { registerWorklogsCommand } from "./commands/worklogs/mod.ts";

export const MAIN_DESCRIPTION = "CLI for Jira + Clockwork workflows.";

export function buildCommand(): Command {
  const program = new Command()
    .name("ergon")
    .version("0.1.0")
    .description(MAIN_DESCRIPTION)
    // ergon is read mostly by scripts and agents, so help and version carry no
    // escape codes. Subcommands inherit the help setting; cliffy's own
    // `--version` colours unconditionally, so it is replaced.
    .help({ colors: false })
    .versionOption(
      "-V, --version",
      "Show the version number for this program.",
      function () {
        // As cliffy has it: `-V` is the bare version, `--version` names ergon.
        const version = this.getVersion();
        const long = this.getRawArgs().includes("--version");
        console.log(long ? `${this.getName()} ${version}` : version);
        Deno.exit(0);
      },
    )
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
