import { assertEquals } from "testing/asserts.ts";
import {
  changedRanges,
  failuresOf,
  inScope,
  type Report,
} from "../scripts/mutate-diff.ts";

const DIFF = [
  "diff --git a/src/adf.ts b/src/adf.ts",
  "index 1111111..2222222 100644",
  "--- a/src/adf.ts",
  "+++ b/src/adf.ts",
  "@@ -10,2 +10,3 @@ function identify(",
  "-old",
  "-old",
  "+new",
  "+new",
  "+new",
  "@@ -40 +41 @@ export function x()",
  "-old",
  "+new",
  "@@ -60,4 +61,0 @@",
  "-gone",
  "diff --git a/src/old.ts b/src/old.ts",
  "deleted file mode 100644",
  "--- a/src/old.ts",
  "+++ /dev/null",
  "@@ -1,3 +0,0 @@",
  "-gone",
  "diff --git a/src/new.ts b/src/new.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/new.ts",
  "@@ -0,0 +1,2 @@",
  "+new",
  "+new",
].join("\n");

Deno.test("each hunk that adds lines becomes a range of them", () => {
  assertEquals(changedRanges(DIFF), [
    { file: "src/adf.ts", from: 10, to: 12 },
    { file: "src/adf.ts", from: 41, to: 41 },
    { file: "src/new.ts", from: 1, to: 2 },
  ]);
});

Deno.test("a deletion alone leaves nothing to mutate", () => {
  assertEquals(changedRanges(DIFF).some((r) => r.from === 61), false);
});

const SCOPE = ["src/*.ts", "!src/main.ts"];

Deno.test("scope takes what a pattern matches", () => {
  assertEquals(inScope("src/adf.ts", SCOPE), true);
});

Deno.test("scope drops what a !pattern excludes", () => {
  assertEquals(inScope("src/main.ts", SCOPE), false);
});

Deno.test("scope drops what no pattern matches", () => {
  assertEquals(inScope("src/commands/log/log.ts", SCOPE), false);
  assertEquals(inScope("tests/adf_test.ts", SCOPE), false);
});

const mutant = (status: string, replacement = "items.length >= 0") => ({
  mutatorName: "EqualityOperator",
  replacement,
  status,
  location: {
    start: { line: 2, column: 7 },
    end: { line: 2, column: 23 },
  },
});

const reportOf = (...mutants: ReturnType<typeof mutant>[]): Report => ({
  files: {
    "src/adf.ts": {
      source: "function f(items) {\n  if (items.length > 0) return 1;\n}\n",
      mutants,
    },
  },
});

Deno.test("a survivor is named with the code it changed and how", () => {
  assertEquals(failuresOf(reportOf(mutant("Survived"))), [
    "src/adf.ts:2:7 Survived EqualityOperator: items.length > 0 → " +
    "items.length >= 0",
  ]);
});

Deno.test("a timeout fails as a survivor does", () => {
  assertEquals(failuresOf(reportOf(mutant("Timeout"))).length, 1);
});

Deno.test("killed and ignored mutants pass", () => {
  assertEquals(
    failuresOf(reportOf(mutant("Killed"), mutant("Ignored"))),
    [],
  );
});

Deno.test("a replacement over many lines is cut to its first", () => {
  const [failure] = failuresOf(reportOf(mutant("Survived", "{\n}")));
  assertEquals(failure?.endsWith("→ { …"), true);
});
