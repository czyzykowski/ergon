import { assertEquals, assertThrows } from "testing/asserts.ts";
import { coverageOf, shortfalls } from "../scripts/check-coverage.ts";

const REPORT = [
  "SF:/repo/src/a.ts",
  "BRF:4",
  "BRH:3",
  "LF:10",
  "LH:8",
  "end_of_record",
  "SF:/repo/src/b.ts",
  "BRF:0",
  "BRH:0",
  "LF:10",
  "LH:4",
  "end_of_record",
].join("\n");

Deno.test("coverage sums lines and branches across every file", () => {
  assertEquals(coverageOf(REPORT), { lines: 60, branches: 75 });
});

Deno.test("a report with no branches counts them as fully covered", () => {
  assertEquals(
    coverageOf("SF:/repo/a.ts\nLF:4\nLH:1\nend_of_record").branches,
    100,
  );
});

Deno.test("a report covering no lines is refused rather than read as 0%", () => {
  assertThrows(() => coverageOf(""), Error, "covers no lines");
});

Deno.test("each measure below its floor is named; one at its floor passes", () => {
  assertEquals(
    shortfalls({ lines: 60, branches: 75 }, { lines: 60, branches: 80 }),
    ["branches 75.0% is below the 80% floor"],
  );
});
