import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { buildJql } from "../src/commands/ls.ts";

Deno.test("the default ordering is unchanged", () => {
  assertEquals(
    buildJql({ limit: 20 }),
    "assignee = currentUser() ORDER BY updated DESC",
  );
});

Deno.test("--order rank asks for the board's own ordering", () => {
  const jql = buildJql({ limit: 20, project: "PCK", order: "rank" });

  assert(jql.startsWith("project = PCK AND"));
  assert(jql.endsWith("ORDER BY Rank ASC"));
});

Deno.test("--order rank across projects refuses, naming the fix", () => {
  assertThrows(
    () => buildJql({ limit: 20, order: "rank" }),
    Error,
    "--project",
  );
});

Deno.test("--sprint does not quietly change the ordering", () => {
  const jql = buildJql({ limit: 20, sprint: true });

  assert(jql.includes("sprint in openSprints()"));
  assert(jql.endsWith("ORDER BY updated DESC"));
});

Deno.test("an unrecognised --order names the two that work", () => {
  assertThrows(
    () => buildJql({ limit: 20, order: "priority" }),
    Error,
    "rank",
  );
});

Deno.test("--since bounds the list to issues that have moved", () => {
  const jql = buildJql({ limit: 20, since: "2026-09-17" });

  assert(jql.includes('updated >= "2026-09-17"'));
  assert(jql.includes(" AND "));
});

Deno.test("--since is a date, because JQL reads an instant in nobody's timezone", () => {
  assertThrows(
    () => buildJql({ limit: 20, since: "2026-09-17T08:00:00Z" }),
    Error,
    "YYYY-MM-DD",
  );
});

Deno.test("a query with no other clause still bounds itself", () => {
  assertEquals(
    buildJql({ limit: 20, all: true }),
    "resolution = Unresolved ORDER BY updated DESC",
  );
});
