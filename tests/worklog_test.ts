import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { worklogBody, worklogPath } from "../src/api/jira.ts";

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

Deno.test("logging asks Jira not to notify, and leaves the estimate to Jira", () => {
  assertEquals(
    worklogPath("PGR-642"),
    "/rest/api/3/issue/PGR-642/worklog?notifyUsers=false",
  );
});

Deno.test("a removal is just as quiet, and leaves the estimate alone", () => {
  assertEquals(
    worklogPath("PGR-642", "45231"),
    "/rest/api/3/issue/PGR-642/worklog/45231" +
      "?notifyUsers=false&adjustEstimate=leave",
  );
});

Deno.test("an issue key with a character needing escaping is encoded", () => {
  assertEquals(
    worklogPath("PGR 642", "45231"),
    "/rest/api/3/issue/PGR%20642/worklog/45231" +
      "?notifyUsers=false&adjustEstimate=leave",
  );
});
