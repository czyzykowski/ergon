import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import type { JiraWorklogEntry } from "../src/api/jira.ts";
import {
  assembleDay,
  removeWorklog,
  requireRemovableWorklog,
  totalSeconds,
} from "../src/worklogs.ts";
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
        id: "45231",
        author: { accountId: ME },
        started: "2026-09-17T11:02:00.000+0100",
        timeSpentSeconds: 2700,
        comment: adf("Reviewed the fix"),
      },
      {
        id: "45188",
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
        id: "45302",
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
      id: "45188",
      issueKey: "PCK-12",
      started: "2026-09-17T09:14:00.000+0100",
      timeSpentSeconds: 3600,
      description: "Paired on the redirect bug",
    },
    {
      id: "45231",
      issueKey: "PCK-12",
      started: "2026-09-17T11:02:00.000+0100",
      timeSpentSeconds: 2700,
      description: "Reviewed the fix",
    },
    {
      id: "45302",
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
          id: "45101",
          author: { accountId: SOMEONE_ELSE },
          started: "2026-09-17T09:00:00.000+0100",
          timeSpentSeconds: 3600,
        },
        {
          id: "45102",
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
          id: "45103",
          author: { accountId: ME },
          started: "2026-09-16T16:00:00.000+0100",
          timeSpentSeconds: 3600,
        },
        {
          id: "45104",
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
        id: "45105",
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

Deno.test("a worklog with no description prints its first four columns", () => {
  const rendered = renderWorklogs(assembleDay(DAY, ME, "2026-09-17"));
  const line = rendered.split("\n").find((row) => row.startsWith("PGR-4"));

  assertEquals(line, "PGR-4   45302  14:30  2h 15m");
});

Deno.test("the id is the second column, so unlog's two tokens read in order", () => {
  const rendered = renderWorklogs(assembleDay(DAY, ME, "2026-09-17"));
  const line = rendered.split("\n").find((row) => row.includes("45188"));

  assertEquals(
    line,
    "PCK-12  45188  09:14  1h      Paired on the redirect bug",
  );
});

Deno.test("a narrow id is padded to the widest in the day", () => {
  const rendered = renderWorklogs([
    {
      id: "7",
      issueKey: "PCK-12",
      started: "2026-09-17T09:00:00.000+0100",
      timeSpentSeconds: 1800,
      description: null,
    },
    {
      id: "45302",
      issueKey: "PCK-12",
      started: "2026-09-17T10:00:00.000+0100",
      timeSpentSeconds: 1800,
      description: null,
    },
  ]);

  assertEquals(rendered.split("\n")[0], "PCK-12  7      09:00  30m");
});

const ON_PCK_12 = [
  {
    id: "45188",
    author: { accountId: ME, displayName: "Me" },
    started: "2026-09-17T09:14:00.000+0100",
    timeSpentSeconds: 3600,
  },
  {
    id: "45231",
    author: { accountId: SOMEONE_ELSE, displayName: "Jane Smith" },
    started: "2026-09-17T11:02:00.000+0100",
    timeSpentSeconds: 2700,
  },
];

Deno.test("the worklog named by an id on the issue is the one handed back", () => {
  assertEquals(
    requireRemovableWorklog(ON_PCK_12, "PCK-12", "45188", ME),
    ON_PCK_12[0],
  );
});

Deno.test("an id on no worklog of the issue names both halves it was given", () => {
  assertThrows(
    () => requireRemovableWorklog(ON_PCK_12, "PCK-12", "99999", ME),
    Error,
    "No worklog 99999 on PCK-12.",
  );
});

Deno.test("a colleague's worklog is refused by naming them, not by vanishing", () => {
  assertThrows(
    () => requireRemovableWorklog(ON_PCK_12, "PCK-12", "45231", ME),
    Error,
    "Worklog 45231 on PCK-12 was logged by Jane Smith, not you.",
  );
});

Deno.test("an unnamed colleague is still refused", () => {
  assertThrows(
    () =>
      requireRemovableWorklog(
        [{
          id: "45231",
          started: "2026-09-17T11:02:00.000+0100",
          author: { accountId: SOMEONE_ELSE },
        }],
        "PCK-12",
        "45231",
        ME,
      ),
    Error,
    "Worklog 45231 on PCK-12 was logged by another user, not you.",
  );
});

/** The slice of Jira a Removal touches, so a Removal is provable without one. */
function fakeJira(entries: readonly JiraWorklogEntry[]) {
  const deleted: string[][] = [];

  return {
    deleted,
    getMyAccountId: () => Promise.resolve(ME),
    listIssueWorklogs: () => Promise.resolve([...entries]),
    deleteWorklog: (issueKey: string, worklogId: string) => {
      deleted.push([issueKey, worklogId]);
      return Promise.resolve();
    },
  };
}

Deno.test("a removal answers with the worklog it removed, for re-logging", async () => {
  const jira = fakeJira([{
    id: "45188",
    author: { accountId: ME },
    started: "2026-09-17T09:14:00.000+0100",
    timeSpentSeconds: 3600,
    comment: adf("Paired on the redirect bug"),
  }]);

  assertEquals(await removeWorklog(jira, "PCK-12", "45188"), {
    id: "45188",
    issueKey: "PCK-12",
    started: "2026-09-17T09:14:00.000+0100",
    timeSpentSeconds: 3600,
    description: "Paired on the redirect bug",
  });
  assertEquals(jira.deleted, [["PCK-12", "45188"]]);
});

Deno.test("a colleague's worklog is not deleted, only refused", async () => {
  const jira = fakeJira(ON_PCK_12);

  await assertRejects(
    () => removeWorklog(jira, "PCK-12", "45231"),
    Error,
    "was logged by Jane Smith, not you",
  );
  assertEquals(jira.deleted, []);
});

Deno.test("an id on no worklog of the issue is not deleted, only refused", async () => {
  const jira = fakeJira(ON_PCK_12);

  await assertRejects(
    () => removeWorklog(jira, "PCK-12", "99999"),
    Error,
    "No worklog 99999 on PCK-12.",
  );
  assertEquals(jira.deleted, []);
});
