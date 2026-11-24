import { assertEquals } from "testing/asserts.ts";
import { join } from "path/mod.ts";
import { addedLines, commentsOnAddedLines } from "../scripts/check-comments.ts";

Deno.test("added lines are read from each checked file's hunks", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -3 +3,2 @@",
    "@@ -9,0 +11 @@",
    "@@ -20,2 +22,0 @@",
    "diff --git a/flake.nix b/flake.nix",
    "+++ b/flake.nix",
    "@@ -1 +1 @@",
  ].join("\n");

  assertEquals(addedLines(diff), new Map([["src/a.ts", new Set([3, 4, 11])]]));
});

async function git(repo: string, ...args: string[]): Promise<void> {
  const { success, stderr } = await new Deno.Command("git", {
    args: ["-C", repo, ...args],
    stdout: "null",
    stderr: "piped",
  }).output();
  if (!success) throw new Error(new TextDecoder().decode(stderr));
}

async function repoWith(files: Record<string, string>): Promise<string> {
  const repo = await Deno.makeTempDir({ prefix: "ergon-check-comments-test-" });
  await git(repo, "init", "--quiet");
  await write(repo, files);
  await commit(repo);
  return repo;
}

async function commit(repo: string) {
  await git(repo, "add", ".");
  await git(
    repo,
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "commit",
  );
}

async function write(repo: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    await Deno.mkdir(join(repo, path, ".."), { recursive: true });
    await Deno.writeTextFile(join(repo, path), text);
  }
}

async function staged(
  before: Record<string, string>,
  after: Record<string, string>,
) {
  const repo = await repoWith(before);
  try {
    await write(repo, after);
    await git(repo, "add", ".");
    const found = await commentsOnAddedLines(repo);
    return found.map(({ path, line }) => `${path}:${line}`);
  } finally {
    await Deno.remove(repo, { recursive: true });
  }
}

Deno.test("only a comment on a staged line is found", async () => {
  assertEquals(
    await staged(
      { "src/a.ts": "// old\nconst a = 1;\n" },
      { "src/a.ts": "// old\nconst a = 2; // new\n" },
    ),
    ["src/a.ts:2"],
  );
});

Deno.test("a doc comment touched on any of its lines is found", async () => {
  assertEquals(
    await staged(
      { "src/a.ts": "/**\n * one\n */\nconst a = 1;\n" },
      { "src/a.ts": "/**\n * two\n */\nconst a = 1;\n" },
    ),
    ["src/a.ts:1"],
  );
});

Deno.test("a renamed file's comments count as added", async () => {
  const repo = await repoWith({ "src/a.ts": "// kept\nconst a = 1;\n" });
  try {
    await git(repo, "mv", "src/a.ts", "src/b.ts");
    const found = await commentsOnAddedLines(repo);
    assertEquals(found.map(({ path, line }) => `${path}:${line}`), [
      "src/b.ts:1",
    ]);
  } finally {
    await Deno.remove(repo, { recursive: true });
  }
});

Deno.test("files outside the TypeScript code are not checked", async () => {
  assertEquals(
    await staged({}, {
      "flake.nix": "# a comment\n",
      "docs/a.ts": "// a comment\n",
    }),
    [],
  );
});

Deno.test("the staged version is checked, not the working tree", async () => {
  const repo = await repoWith({ "src/a.ts": "const a = 1;\n" });
  try {
    await write(repo, { "src/a.ts": "const a = 2; // staged\n" });
    await git(repo, "add", ".");
    await write(repo, { "src/a.ts": "const a = 2;\n" });
    const found = await commentsOnAddedLines(repo);
    assertEquals(found.map(({ line }) => line), [1]);
  } finally {
    await Deno.remove(repo, { recursive: true });
  }
});

Deno.test("a file-level ignore cannot hide the file from the check", async () => {
  assertEquals(
    await staged({}, {
      "src/a.ts": "// deno-lint-ignore-file\nconst a = 1; // hidden\n",
    }),
    ["src/a.ts:1", "src/a.ts:2"],
  );
});

Deno.test("against a base, the commits since it are checked", async () => {
  const repo = await repoWith({ "src/a.ts": "const a = 1;\n" });
  try {
    await write(repo, { "src/a.ts": "const a = 1; // committed\n" });
    await commit(repo);
    const found = await commentsOnAddedLines(repo, "HEAD~1");
    assertEquals(found.map(({ path, line }) => `${path}:${line}`), [
      "src/a.ts:1",
    ]);
  } finally {
    await Deno.remove(repo, { recursive: true });
  }
});
