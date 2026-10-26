import { dirname, fromFileUrl } from "path/mod.ts";
import { assert, assertEquals } from "testing/asserts.ts";
import { resolveConfigPath } from "../src/config.ts";

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
  return await runErgonWith({}, ...args);
}

/** As `runErgon`, with `overrides` laid over the inherited environment. */
async function runErgonWith(
  overrides: Record<string, string>,
  ...args: string[]
): Promise<Run> {
  const env = { ...Deno.env.toObject(), ...overrides };
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

Deno.test("an unknown command is a usage error like any other", async () => {
  const run = await runErgon("bogus");

  assertEquals(run.code, 1);
  assertEquals(run.stdout, "");
  assert(run.stderr.startsWith('Unknown command "bogus".'), run.stderr);
  assertEquals(run.stderr.split("\n").length, 2, run.stderr);
});

Deno.test("--version is plain text on stdout, and -V the bare number", async () => {
  assertEquals(await runErgon("--version"), {
    code: 0,
    stdout: "ergon 0.1.0\n",
    stderr: "",
  });
  assertEquals(await runErgon("-V"), {
    code: 0,
    stdout: "0.1.0\n",
    stderr: "",
  });
});

Deno.test("search refuses a project ergon is not configured for", async () => {
  // Jira would answer an unknown key with no issues, so the refusal is the
  // only thing telling a typo apart from "nothing matched". The base URL goes
  // nowhere, so a refusal that came too late would fail differently.
  const home = await Deno.makeTempDir();
  // Deno keeps its module cache under HOME, so a fresh HOME alone would
  // download every dependency again before ergon ran a line.
  const info = await new Deno.Command(Deno.execPath(), {
    args: ["info", "--json"],
  }).output();
  const { denoDir } = JSON.parse(new TextDecoder().decode(info.stdout));
  const configPath = resolveConfigPath(home);

  try {
    await Deno.mkdir(dirname(configPath), { recursive: true });
    await Deno.writeTextFile(
      configPath,
      [
        "jira:",
        "  baseUrl: http://127.0.0.1:9",
        "  email: test@example.com",
        "  apiToken: token",
        "clockwork:",
        "  baseUrl: http://127.0.0.1:9",
        "  apiToken: token",
        "defaults:",
        "  projects:",
        "    PCK:",
        "      fields:",
        "        sprintFieldId: customfield_10010",
      ].join("\n"),
    );

    const run = await runErgonWith(
      { HOME: home, DENO_DIR: denoDir },
      "search",
      "login",
      "--project",
      "PGR",
    );

    assertEquals(run.code, 1);
    assertEquals(run.stdout, "");
    assert(
      run.stderr.startsWith("No configuration for project PGR."),
      run.stderr,
    );
  } finally {
    await Deno.remove(home, { recursive: true });
  }
});
