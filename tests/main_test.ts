import { fromFileUrl } from "path/mod.ts";
import { assert, assertEquals } from "testing/asserts.ts";

const MAIN = fromFileUrl(new URL("../src/main.ts", import.meta.url));

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * ergon as a script would see it: output captured, not a terminal, and
 * NO_COLOR unset so nothing but ergon itself can be suppressing colour.
 */
async function runErgon(...args: string[]): Promise<Run> {
  const env = Deno.env.toObject();
  delete env.NO_COLOR;

  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-net",
      "--allow-read",
      "--allow-env",
      "--allow-write",
      MAIN,
      ...args,
    ],
    clearEnv: true,
    env,
  }).output();
  const decoder = new TextDecoder();

  return {
    code,
    stdout: decoder.decode(stdout),
    stderr: decoder.decode(stderr),
  };
}

Deno.test("a usage error prints its message alone on stderr", async () => {
  const run = await runErgon("attachments", "X-1", "--download");

  assertEquals(run, {
    code: 1,
    stdout: "",
    stderr: 'Missing value for option "--download".\n',
  });
});

Deno.test("help is plain text on stdout", async () => {
  const run = await runErgon("--help");

  assertEquals(run.code, 0);
  assert(run.stdout.includes("Usage:"), run.stdout);
  assert(!run.stdout.includes("\x1b"), JSON.stringify(run.stdout));
});
