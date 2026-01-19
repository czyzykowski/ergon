import { Command } from "cliffy/command/mod.ts";

export const MAIN_DESCRIPTION =
  "CLI for Jira + Clockwork workflows.";

export function buildCommand(): Command {
  return new Command()
    .name("ergon")
    .version("0.1.0")
    .description(MAIN_DESCRIPTION);
}

export async function main(): Promise<void> {
  await buildCommand().parse(Deno.args);
}

if (import.meta.main) {
  await main();
}
