import { Command } from "cliffy/command/mod.ts";
import { assertEquals, assertExists } from "testing/asserts.ts";
import type { NewOptions } from "../src/commands/new/mod.ts";
import { registerNewCommand, usesCache } from "../src/commands/new/mod.ts";

// Parses through the real `ergon new` declaration, with the action swapped for
// one that keeps the options, so the flags are read as cliffy hands them over.
async function parseNew(args: string[]): Promise<NewOptions> {
  const program = new Command().throwErrors();
  registerNewCommand(program);
  let parsed: NewOptions | undefined;
  const command = program.getCommand("new");
  assertExists(command);
  command.action((options: NewOptions) => {
    parsed = options;
  });

  await program.parse(["new", ...args]);

  assertExists(parsed);
  return parsed;
}

Deno.test("ergon new --no-cache does not use the Cache", async () => {
  assertEquals(usesCache(await parseNew(["Fix login", "--no-cache"])), false);
});

Deno.test("ergon new uses the Cache without --no-cache", async () => {
  assertEquals(usesCache(await parseNew(["Fix login"])), true);
});
