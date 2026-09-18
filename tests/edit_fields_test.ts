import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { planEdit } from "../src/commands/edit_fields.ts";

Deno.test("--due writes the date and leaves the description alone", () => {
  const plan = planEdit({ due: "2026-09-20" });

  assertEquals(plan.writes, [{ field: "due", value: "2026-09-20" }]);
  assertEquals(plan.opensEditor, false);
  assertEquals(plan.fetchesDescription, false);
});

Deno.test("--summary no longer opens the editor", () => {
  const plan = planEdit({ summary: "Fix the redirect" });

  assertEquals(plan.writes, [{ field: "summary", value: "Fix the redirect" }]);
  assertEquals(plan.opensEditor, false);
  assertEquals(plan.fetchesDescription, false);
});

Deno.test("--description is the one flag that reads the current description", () => {
  const plan = planEdit({ description: "Body" });

  assertEquals(plan.writes, [{ field: "description" }]);
  assertEquals(plan.opensEditor, false);
  assertEquals(plan.fetchesDescription, true);
});

Deno.test("naming no field opens the description, and decides later what to write", () => {
  const plan = planEdit({});

  assertEquals(plan.writes, []);
  assertEquals(plan.opensEditor, true);
  assertEquals(plan.fetchesDescription, true);
});

Deno.test("fields are planned in the receipt's order", () => {
  const plan = planEdit({
    sprint: "current",
    due: "2026-09-20",
    summary: "Fix the redirect",
    description: "Body",
  });

  assertEquals(plan.writes.map((write) => write.field), [
    "description",
    "summary",
    "due",
    "sprint",
  ]);
});

Deno.test("'none' clears a due date rather than writing one", () => {
  assertEquals(planEdit({ due: "none" }).writes, [
    { field: "due", value: null },
  ]);
});

Deno.test("'none' takes an issue out of its sprint", () => {
  assertEquals(planEdit({ sprint: "none" }).writes, [
    { field: "sprint", target: { kind: "none" } },
  ]);
});

Deno.test("a sprint is named, numbered, or asked for as the current one", () => {
  assertEquals(planEdit({ sprint: "1296" }).writes, [
    { field: "sprint", target: { kind: "id", id: 1296 } },
  ]);
  assertEquals(planEdit({ sprint: "current" }).writes, [
    { field: "sprint", target: { kind: "current" } },
  ]);
  assertEquals(planEdit({ sprint: "Sep 14 - 19" }).writes, [
    { field: "sprint", target: { kind: "name", name: "Sep 14 - 19" } },
  ]);
});

Deno.test("a malformed due date is ergon's error, not Jira's", () => {
  assertThrows(
    () => planEdit({ due: "next friday" }),
    Error,
    "YYYY-MM-DD",
  );
});

Deno.test("--force belongs to --description", () => {
  assertEquals(planEdit({ description: "Body", force: true }).writes, [
    { field: "description" },
  ]);
});

Deno.test("--force on a field write is an error, not a silent no-op", () => {
  assertThrows(
    () => planEdit({ due: "2026-09-20", force: true }),
    Error,
    "--force applies only to --description.",
  );
});

Deno.test("--force on the editor path stays refused, per ADR 0003", () => {
  assertThrows(
    () => planEdit({ force: true }),
    Error,
    "--force applies only to --description.",
  );
});
