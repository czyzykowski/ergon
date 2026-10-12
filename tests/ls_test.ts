import { assert, assertEquals, assertThrows } from "testing/asserts.ts";
import { buildJql, filterClauses, listOrder } from "../src/commands/ls.ts";

Deno.test("the default ordering is unchanged", () => {
  assertEquals(
    buildJql({ limit: 20 }),
    "assignee = currentUser() ORDER BY updated DESC",
  );
});

Deno.test("--order rank is gone, and the error names its replacement", () => {
  assertThrows(
    () => buildJql({ limit: 20, project: "PCK", order: "rank" }),
    Error,
    "--order board",
  );
});

Deno.test("--order board is a recognised ordering", () => {
  assertEquals(listOrder({ limit: 20, order: "board" }), "board");
});

Deno.test("--sprint does not quietly change the ordering", () => {
  const jql = buildJql({ limit: 20, sprint: true });

  assert(jql.includes("sprint in openSprints()"));
  assert(jql.endsWith("ORDER BY updated DESC"));
});

Deno.test("--sprint keeps every status, because the board shows them all", () => {
  const clauses = filterClauses({ limit: 20, sprint: true });

  assertEquals(clauses, [
    "sprint in openSprints()",
    "assignee = currentUser()",
  ]);
});

Deno.test("an unrecognised --order names the two that work", () => {
  assertThrows(
    () => buildJql({ limit: 20, order: "priority" }),
    Error,
    "board",
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
    "statusCategory != Done ORDER BY updated DESC",
  );
});
