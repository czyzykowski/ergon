import { assertEquals } from "testing/asserts.ts";
import { commitsMissingChangelog } from "../scripts/check-changelog.ts";

// The script reads `git log --format=%x1e%h %s --name-only`; RS opens each commit.
function log(...commits: string[][]): string {
  return commits.map(([subject, ...files]) =>
    `\x1e${subject}\n\n${files.join("\n")}\n`
  ).join("");
}

Deno.test("a feat or fix that changes src/ without CHANGELOG.md is reported", () => {
  const missing = commitsMissingChangelog(log(
    ["abc1234 feat: add ls --json", "src/commands/ls.ts"],
    ["def5678 fix(new)!: refuse an empty summary", "src/commands/new.ts"],
  ));
  assertEquals(missing, [
    "abc1234 feat: add ls --json",
    "def5678 fix(new)!: refuse an empty summary",
  ]);
});

Deno.test("a feat or fix that also changes CHANGELOG.md passes", () => {
  const missing = commitsMissingChangelog(log(
    ["abc1234 feat: add ls --json", "CHANGELOG.md", "src/commands/ls.ts"],
  ));
  assertEquals(missing, []);
});

Deno.test("refactors, docs, and a fix outside src/ need no CHANGELOG entry", () => {
  const missing = commitsMissingChangelog(log(
    ["abc1234 refactor: extract a Prompter", "src/commands/new.ts"],
    ["def5678 docs: spec ergon new", "specs/new.md"],
    ["0123abc fix: build the devShell without a C toolchain", "flake.nix"],
  ));
  assertEquals(missing, []);
});

Deno.test("an empty range reports nothing", () => {
  assertEquals(commitsMissingChangelog(""), []);
});
