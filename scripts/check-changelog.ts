// Fails when a feat or fix commit in a git revision range changes src/ without
// touching CHANGELOG.md in the same commit. CI runs it over each push.
//
// Usage: deno run --allow-run=git scripts/check-changelog.ts <rev-range>

const USER_VISIBLE = /^\S+ (feat|fix)(\([^)]*\))?!?:/;

/** Parses `git log --format=%x1e%h %s --name-only` output. */
export function commitsMissingChangelog(log: string): string[] {
  return log.split("\x1e").slice(1)
    .map((block) => {
      const [subject = "", ...files] = block.trim().split("\n")
        .filter((line) => line !== "");
      return { subject, files };
    })
    .filter(({ subject, files }) =>
      USER_VISIBLE.test(subject) &&
      files.some((file) => file.startsWith("src/")) &&
      !files.includes("CHANGELOG.md")
    )
    .map(({ subject }) => subject);
}

async function gitLog(range: string): Promise<string> {
  const { success, stdout } = await new Deno.Command("git", {
    args: ["log", "--no-merges", "--format=%x1e%h %s", "--name-only", range],
    stderr: "inherit",
  }).output();
  if (!success) throw new Error(`git log ${range} failed.`);
  return new TextDecoder().decode(stdout);
}

if (import.meta.main) {
  const range = Deno.args[0];
  if (!range) {
    console.error(
      "Usage: deno run --allow-run=git scripts/check-changelog.ts <rev-range>",
    );
    Deno.exit(2);
  }
  const missing = commitsMissingChangelog(await gitLog(range));
  if (missing.length > 0) {
    console.error(
      "These feat/fix commits change src/ but not CHANGELOG.md:\n" +
        missing.map((subject) => `  ${subject}`).join("\n"),
    );
    Deno.exit(1);
  }
}
