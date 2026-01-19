import { Command } from "cliffy/command/mod.ts";
import { ConfigError } from "./config.ts";
import { registerStartCommand } from "./commands/start.ts";
import { registerStatusCommand } from "./commands/status.ts";
import { registerStopCommand } from "./commands/stop.ts";

export const MAIN_DESCRIPTION = "CLI for Jira + Clockwork workflows.";

export function buildCommand(): Command {
  const program = new Command()
    .name("ergon")
    .version("0.1.0")
    .description(MAIN_DESCRIPTION);

  registerStartCommand(program);
  registerStopCommand(program);
  registerStatusCommand(program);

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
