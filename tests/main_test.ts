import { dirname, fromFileUrl } from "path/mod.ts";
import { assert, assertEquals } from "testing/asserts.ts";
import { resolveConfigPath } from "../src/config.ts";
import { saveState } from "../src/state.ts";

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
      // As the installed binary has it, so an editor ergon wrongly opened
      // would really run rather than fail on a permission.
      "--allow-run",
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

/**
 * Runs `test` with a fresh HOME holding a config whose Jira goes nowhere and
 * which declares PCK, so whatever a run reaches it reaches without network.
 * `jiraBaseUrl` points Jira somewhere that answers instead.
 */
async function withTestHome(
  test: (env: Record<string, string>) => Promise<void>,
  jiraBaseUrl = "http://127.0.0.1:9",
): Promise<void> {
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
        `  baseUrl: ${jiraBaseUrl}`,
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

    await test({ HOME: home, DENO_DIR: denoDir });
  } finally {
    await Deno.remove(home, { recursive: true });
  }
}

Deno.test("search refuses a project ergon is not configured for", async () => {
  // Jira would answer an unknown key with no issues, so the refusal is the
  // only thing telling a typo apart from "nothing matched". The base URL goes
  // nowhere, so a refusal that came too late would fail differently.
  await withTestHome(async (env) => {
    const run = await runErgonWith(env, "search", "login", "--project", "PGR");

    assertEquals(run.code, 1);
    assertEquals(run.stdout, "");
    assert(
      run.stderr.startsWith("No configuration for project PGR."),
      run.stderr,
    );
  });
});

// Without a terminal a run is Non-interactive unasked, so each of these
// completing at all is the proof that it no longer waits on a prompt.

Deno.test("new without a terminal names --project when none resolves", async () => {
  await withTestHome(async (env) => {
    const run = await runErgonWith(env, "new", "A summary");

    assertEquals(run, {
      code: 1,
      stdout: "",
      stderr: "Project key is required; pass --project.\n",
    });
  });
});

Deno.test("new without a terminal ignores the remembered project", async () => {
  // PCK is declared, so the remembered project would get as far as Jira and
  // fail differently; naming --project proves it was never picked up.
  await withTestHome(async (env) => {
    await saveState({ lastProject: "PCK" }, env.HOME);

    const run = await runErgonWith(env, "new", "--summary", "x");

    assertEquals(run, {
      code: 1,
      stdout: "",
      stderr: "Project key is required; pass --project.\n",
    });
  });
});

Deno.test("new without a terminal names --summary when none is given", async () => {
  await withTestHome(async (env) => {
    const run = await runErgonWith(env, "new", "--project", "PCK");

    assertEquals(run, {
      code: 1,
      stdout: "",
      stderr: "Summary is required; pass --summary.\n",
    });
  });
});

/**
 * Runs `test` in a test home whose `$EDITOR` and `$VISUAL` would succeed and
 * leave `marker` behind, so a marker still absent afterwards proves the editor
 * never ran.
 */
async function withWillingEditor(
  test: (env: Record<string, string>, marker: string) => Promise<void>,
): Promise<void> {
  await withTestHome(async (env) => {
    const marker = `${env.HOME}/editor-ran`;
    const editor = `touch ${marker}`;

    await test({ ...env, EDITOR: editor, VISUAL: editor }, marker);
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

Deno.test("edit without a terminal names the field flags instead of opening the editor", async () => {
  await withWillingEditor(async (env, marker) => {
    const run = await runErgonWith(env, "edit", "X-1");

    assertEquals(run, {
      code: 1,
      stdout: "",
      stderr:
        "A field to edit is required; pass --summary, --description, --due, --sprint or --assignee.\n",
    });
    assertEquals(await exists(marker), false);
  });
});

Deno.test("comment without a terminal names --body instead of opening the editor", async () => {
  for (const args of [["X-1"], ["X-1", "--id", "10001"]]) {
    await withWillingEditor(async (env, marker) => {
      const run = await runErgonWith(env, "comment", ...args);

      assertEquals(run, {
        code: 1,
        stdout: "",
        stderr: "A comment body is required; pass --body.\n",
      }, args.join(" "));
      assertEquals(await exists(marker), false, args.join(" "));
    });
  }
});

Deno.test("move without a terminal names --to before calling Jira", async () => {
  // Jira goes nowhere, so a refusal that came after fetching the transitions
  // would fail with a connection error instead.
  await withTestHome(async (env) => {
    const run = await runErgonWith(env, "move", "X-1");

    assertEquals(run, {
      code: 1,
      stdout: "",
      stderr: "Target status is required; pass --to.\n",
    });
  });
});

Deno.test("move with an unknown --to lists the available transitions", async () => {
  await using jira = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    () =>
      Response.json({
        transitions: [
          { id: "11", name: "In Progress" },
          { id: "21", name: "Done" },
        ],
      }),
  );

  await withTestHome(async (env) => {
    const run = await runErgonWith(env, "move", "X-1", "--to", "Shipped");

    assertEquals(run, {
      code: 1,
      stdout: "",
      stderr:
        "No transition found for 'Shipped'. Available: In Progress, Done\n",
    });
  }, `http://127.0.0.1:${jira.addr.port}`);
});

Deno.test("menu without a terminal refuses to start", async () => {
  assertEquals(await runErgon("menu"), {
    code: 1,
    stdout: "",
    stderr: "ergon menu needs a terminal.\n",
  });
});
