import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { assembleDay, totalSeconds } from "../src/worklogs.ts";
import { renderWorklogs } from "../src/commands/worklogs.ts";

const ME = "557058:me";
const SOMEONE_ELSE = "557058:them";

function adf(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const DAY = [
  {
    issueKey: "PCK-12",
    worklogs: [
      {
        author: { accountId: ME },
        started: "2026-09-17T11:02:00.000+0100",
        timeSpentSeconds: 2700,
        comment: adf("Reviewed the fix"),
      },
      {
        author: { accountId: ME },
        started: "2026-09-17T09:14:00.000+0100",
        timeSpentSeconds: 3600,
        comment: adf("Paired on the redirect bug"),
      },
    ],
  },
  {
    issueKey: "PGR-4",
    worklogs: [
      {
        author: { accountId: ME },
        started: "2026-09-17T14:30:00.000+0100",
        timeSpentSeconds: 8100,
      },
    ],
  },
];

Deno.test("a day is assembled earliest first, whatever order Jira answered in", () => {
  const day = assembleDay(DAY, ME, "2026-09-17");

  assertEquals(day, [
    {
      issueKey: "PCK-12",
      started: "2026-09-17T09:14:00.000+0100",
      timeSpentSeconds: 3600,
      description: "Paired on the redirect bug",
    },
    {
      issueKey: "PCK-12",
      started: "2026-09-17T11:02:00.000+0100",
      timeSpentSeconds: 2700,
      description: "Reviewed the fix",
    },
    {
      issueKey: "PGR-4",
      started: "2026-09-17T14:30:00.000+0100",
      timeSpentSeconds: 8100,
      description: null,
    },
  ]);
});

Deno.test("two blocks on one issue at different times stay two facts", () => {
  const day = assembleDay(DAY, ME, "2026-09-17");

  assertEquals(day.filter((entry) => entry.issueKey === "PCK-12").length, 2);
});

Deno.test("a shared issue's other contributors are not my hours", () => {
  const day = assembleDay(
    [{
      issueKey: "PCK-12",
      worklogs: [
        {
          author: { accountId: SOMEONE_ELSE },
          started: "2026-09-17T09:00:00.000+0100",
          timeSpentSeconds: 3600,
        },
        {
          author: { accountId: ME },
          started: "2026-09-17T10:00:00.000+0100",
          timeSpentSeconds: 1800,
        },
      ],
    }],
    ME,
    "2026-09-17",
  );

  assertEquals(day.length, 1);
  assertEquals(day[0].timeSpentSeconds, 1800);
});

Deno.test("an issue worked across several days reports only the day asked for", () => {
  const day = assembleDay(
    [{
      issueKey: "PCK-12",
      worklogs: [
        {
          author: { accountId: ME },
          started: "2026-09-16T16:00:00.000+0100",
          timeSpentSeconds: 3600,
        },
        {
          author: { accountId: ME },
          started: "2026-09-17T09:00:00.000+0100",
          timeSpentSeconds: 1800,
        },
      ],
    }],
    ME,
    "2026-09-17",
  );

  assertEquals(day.length, 1);
  assertEquals(day[0].started, "2026-09-17T09:00:00.000+0100");
});

Deno.test("a worklog comment holding formatting still reads as text", () => {
  const day = assembleDay(
    [{
      issueKey: "PCK-12",
      worklogs: [{
        author: { accountId: ME },
        started: "2026-09-17T09:00:00.000+0100",
        timeSpentSeconds: 1800,
        comment: {
          type: "doc",
          version: 1,
          content: [{
            type: "bulletList",
            content: [{
              type: "listItem",
              content: [{
                type: "paragraph",
                content: [{ type: "text", text: "Standup" }],
              }],
            }],
          }],
        },
      }],
    }],
    ME,
    "2026-09-17",
  );

  assertEquals(day[0].description, "- Standup");
});

Deno.test("an empty day is an empty array and says so", () => {
  const day = assembleDay([], ME, "2026-09-17");

  assertEquals(day, []);
  assertEquals(renderWorklogs(day), "No worklogs found.");
});

Deno.test("the rendered total is the sum of what it lists", () => {
  const day = assembleDay(DAY, ME, "2026-09-17");
  const rendered = renderWorklogs(day);

  assertEquals(totalSeconds(day), 3600 + 2700 + 8100);
  assertEquals(rendered.split("\n").at(-1), "Total: 4h");
});

Deno.test("a worklog with no description prints its first three columns", () => {
  const rendered = renderWorklogs(assembleDay(DAY, ME, "2026-09-17"));
  const line = rendered.split("\n").find((row) => row.startsWith("PGR-4"));

  assertEquals(line, "PGR-4   14:30  2h 15m");
});
