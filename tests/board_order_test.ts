import { assertEquals, assertRejects, assertThrows } from "testing/asserts.ts";
import type { JiraIssueResponse } from "../src/api/jira.ts";
import {
  boardForScope,
  boardJql,
  boardOrder,
  type BoardSource,
  listInBoardOrder,
  sprintIdsOf,
} from "../src/board_order.ts";
import type { ProjectDefaults } from "../src/types.ts";

const ACTIVE = 1328;
const NEXT = 1329;
const ARCHIVE = 1046;
const CLOSED = 1200;

const PROJECTS: Record<string, ProjectDefaults> = {
  PCK: { fields: { sprintFieldId: "customfield_10010", sprintBoardId: 26 } },
  PGR: { fields: { sprintFieldId: "customfield_10010", sprintBoardId: 26 } },
};

function issue(
  key: string,
  sprints: number[],
  category = "new",
): JiraIssueResponse {
  return {
    id: key,
    key,
    fields: {
      summary: key,
      status: { name: category, statusCategory: { key: category } },
      issuetype: { name: "Task" },
      project: { key: key.split("-")[0] },
      customfield_10010: sprints.map((id) => ({ id, name: `${id}` })),
    } as unknown as JiraIssueResponse["fields"],
  };
}

function placed(key: string, sprintIds: number[], done = false) {
  return { item: key, sprintIds, done };
}

Deno.test("the active sprint comes before a higher-ranked backlog issue", () => {
  assertEquals(
    boardOrder([placed("BACKLOG", []), placed("SPRINT", [ACTIVE])], [ACTIVE]),
    ["SPRINT", "BACKLOG"],
  );
});

Deno.test("rank decides within a group, across projects", () => {
  assertEquals(
    boardOrder(
      [
        placed("PCK-1", [ACTIVE]),
        placed("PGR-1", [NEXT]),
        placed("PGR-2", [ACTIVE]),
        placed("PCK-2", [NEXT]),
      ],
      [ACTIVE, NEXT],
    ),
    ["PCK-1", "PGR-2", "PGR-1", "PCK-2"],
  );
});

Deno.test("upcoming sprints follow the board's sequence, not their names", () => {
  assertEquals(
    boardOrder(
      [placed("ARCHIVED", [ARCHIVE]), placed("NEXT", [NEXT])],
      [ACTIVE, NEXT, ARCHIVE],
    ),
    ["NEXT", "ARCHIVED"],
  );
});

Deno.test("a done issue in an open sprint stays; in the backlog it is off the board", () => {
  assertEquals(
    boardOrder(
      [
        placed("DONE-OLD", [CLOSED], true),
        placed("DONE-NOW", [ACTIVE], true),
        placed("OPEN", []),
      ],
      [ACTIVE],
    ),
    ["DONE-NOW", "OPEN"],
  );
});

Deno.test("a closed sprint in an issue's history does not place it", () => {
  assertEquals(
    boardOrder(
      [placed("CARRIED", [CLOSED, NEXT]), placed("NOW", [ACTIVE])],
      [ACTIVE, NEXT],
    ),
    ["NOW", "CARRIED"],
  );
});

Deno.test("projects sharing a board need no --project", () => {
  assertEquals(boardForScope(PROJECTS), 26);
});

Deno.test("projects on different boards refuse, naming the fix", () => {
  assertThrows(
    () =>
      boardForScope({
        ...PROJECTS,
        PGR: { fields: { sprintFieldId: "x", sprintBoardId: 373 } },
      }),
    Error,
    "--project",
  );
});

Deno.test("--project picks that project's board", () => {
  assertEquals(
    boardForScope({
      ...PROJECTS,
      PGR: { fields: { sprintFieldId: "x", sprintBoardId: 373 } },
    }, "PGR"),
    373,
  );
});

Deno.test("a project with no board names the config line", () => {
  assertThrows(
    () => boardForScope({ PCK: { fields: { sprintFieldId: "x" } } }),
    Error,
    "defaults.projects.PCK.fields.sprintBoardId",
  );
});

Deno.test("the board's filter scopes the query, in rank order", () => {
  assertEquals(
    boardJql("10038", ["assignee = currentUser()"]),
    "filter = 10038 AND assignee = currentUser() AND " +
      "(sprint in openSprints() OR sprint in futureSprints() OR statusCategory != Done) " +
      "ORDER BY Rank ASC",
  );
});

Deno.test("sprint ids are read from any declared sprint field", () => {
  assertEquals(sprintIdsOf(issue("TCCC-1", [ARCHIVE, NEXT]), PROJECTS), [
    ARCHIVE,
    NEXT,
  ]);
});

Deno.test("listInBoardOrder regroups what the board's filter returns", async () => {
  const queries: string[] = [];
  const jira: BoardSource = {
    getBoardConfiguration: () =>
      Promise.resolve({ filterId: "10038", ranked: true }),
    listOpenSprintIds: () => Promise.resolve([ACTIVE, NEXT]),
    searchAll: (jql) => {
      queries.push(jql);
      return Promise.resolve([
        issue("PCK-672", []),
        issue("PGR-1553", [ACTIVE]),
        issue("PCK-654", [CLOSED], "done"),
        issue("PCK-1228", [NEXT]),
      ]);
    },
  };

  const ordered = await listInBoardOrder({
    jira,
    boardId: 26,
    clauses: ["assignee = currentUser()"],
    projects: PROJECTS,
  });

  assertEquals(ordered.map((i) => i.key), ["PGR-1553", "PCK-1228", "PCK-672"]);
  assertEquals(queries.length, 1);
});

Deno.test("a board not ordered by rank has no board order", async () => {
  const jira: BoardSource = {
    getBoardConfiguration: () =>
      Promise.resolve({ filterId: "10564", ranked: false }),
    listOpenSprintIds: () => Promise.resolve([]),
    searchAll: () => Promise.resolve([]),
  };

  await assertRejects(
    () => listInBoardOrder({ jira, boardId: 439, clauses: [] }),
    Error,
    "not ordered by Rank",
  );
});
