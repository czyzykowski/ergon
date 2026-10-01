import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { renderRemoval } from "../src/commands/unlog.ts";

Deno.test("a receipt names what went, in the order a re-log is typed", () => {
  assertEquals(
    renderRemoval({
      id: "45188",
      issueKey: "PCK-12",
      started: "2026-09-17T09:14:00.000+0100",
      timeSpentSeconds: 3600,
      description: "Paired on the redirect bug",
      descriptionDegraded: [],
    }),
    "Removed 1h on PCK-12 at 2026-09-17 09:14 (45188): Paired on the redirect bug",
  );
});

Deno.test("a receipt for a worklog that had no description stops short", () => {
  assertEquals(
    renderRemoval({
      id: "45302",
      issueKey: "PGR-4",
      started: "2026-09-17T14:30:00.000+0100",
      timeSpentSeconds: 8100,
      description: null,
      descriptionDegraded: [],
    }),
    "Removed 2h 15m on PGR-4 at 2026-09-17 14:30 (45302)",
  );
});

Deno.test("a receipt admits what the comment lost, so a re-log is not trusted blind", () => {
  assertEquals(
    renderRemoval({
      id: "45401",
      issueKey: "PCK-12",
      started: "2026-09-17T09:00:00.000+0100",
      timeSpentSeconds: 1800,
      description: "> Billed to the retainer",
      descriptionDegraded: ["panel"],
    }),
    "Removed 30m on PCK-12 at 2026-09-17 09:00 (45401): " +
      "> Billed to the retainer (degraded: panel)",
  );
});
