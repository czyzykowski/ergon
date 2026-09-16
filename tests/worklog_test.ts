import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { worklogBody } from "../src/api/jira.ts";

Deno.test("worklogBody sends the comment as an ADF document", () => {
  assertEquals(
    worklogBody({
      issueKey: "PGR-642",
      timeSpentSeconds: 1800,
      startedAt: "2026-09-16T15:00:00.000+0200",
      comment: "Pickaxe Daily Standup",
    }),
    {
      timeSpentSeconds: 1800,
      started: "2026-09-16T15:00:00.000+0200",
      comment: {
        type: "doc",
        version: 1,
        content: [{
          type: "paragraph",
          content: [{ type: "text", text: "Pickaxe Daily Standup" }],
        }],
      },
    },
  );
});

Deno.test("worklogBody leaves out what was not given", () => {
  assertEquals(worklogBody({ issueKey: "PGR-642", timeSpentSeconds: 900 }), {
    timeSpentSeconds: 900,
  });
});
