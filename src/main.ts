import { Command } from "cliffy/command/mod.ts";

export const MAIN_DESCRIPTION =
  "CLI for Jira + Clockwork workflows.";

export function buildCommand(): Command {
  return new Command()
    .name("ergon")
    .version("0.1.0")
    .description(MAIN_DESCRIPTION);
}

if (import.meta.main) {
  await buildCommand().parse(Deno.args);
}
