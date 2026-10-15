import { assertEquals, assertRejects, assertThrows } from "testing/asserts.ts";
import {
  listOpenSprints,
  requireSprintFieldId,
  resolveSprintId,
  scrumBoards,
} from "../src/sprint.ts";
import type { JiraSprint } from "../src/api/jira.ts";

const DELIVERY = { id: 12, name: "Delivery", type: "scrum" };
const ESTIMATES = { id: 34, name: "Estimates", type: "scrum" };
const SUPPORT = { id: 56, name: "Support", type: "kanban" };

const OCT_12 = { id: 1329, name: "Oct 12 - 16", state: "active" };

/** A Jira that answers per board, and remembers which boards it was asked. */
function sprintSource(byBoard: Record<number, JiraSprint[]>) {
  const asked: number[] = [];
  return {
    asked,
    listActiveSprints(boardId: number): Promise<JiraSprint[]> {
      asked.push(boardId);
      const sprints = byBoard[boardId];
      if (!sprints) {
        return Promise.reject(new Error(`board ${boardId} has no sprints`));
      }
      return Promise.resolve(sprints);
    },
  };
}

Deno.test("the active sprint is the board's only one", async () => {
  const sprintId = await resolveSprintId({
    projectKey: "PCK",
    jira: sprintSource({ 12: [OCT_12] }),
    boards: [DELIVERY],
  });

  assertEquals(sprintId, 1329);
});

Deno.test("boards sharing a sprint give one answer, so several boards need no configuration", async () => {
  const sprintId = await resolveSprintId({
    projectKey: "PCK",
    jira: sprintSource({ 12: [OCT_12], 34: [OCT_12] }),
    boards: [DELIVERY, ESTIMATES],
  });

  assertEquals(sprintId, 1329);
});

Deno.test("a board that has no sprints is never asked for one", async () => {
  const jira = sprintSource({ 12: [OCT_12] });
  const sprintId = await resolveSprintId({
    projectKey: "PCK",
    jira,
    boards: [SUPPORT, DELIVERY],
  });

  assertEquals(sprintId, 1329);
  assertEquals(jira.asked, [12]);
});

Deno.test("a board with no active sprint is passed over for one that has it", async () => {
  const sprintId = await resolveSprintId({
    projectKey: "PCK",
    jira: sprintSource({ 12: [], 34: [OCT_12] }),
    boards: [DELIVERY, ESTIMATES],
  });

  assertEquals(sprintId, 1329);
});

Deno.test("different active sprints refuse, naming each", async () => {
  await assertRejects(
    () =>
      resolveSprintId({
        projectKey: "PCK",
        jira: sprintSource({
          12: [OCT_12],
          34: [{ id: 1400, name: "Estimation 7", state: "active" }],
        }),
        boards: [DELIVERY, ESTIMATES],
      }),
    Error,
    "Oct 12 - 16 (1329) on Delivery (12), Estimation 7 (1400) on Estimates (34)",
  );
  await assertRejects(
    () =>
      resolveSprintId({
        projectKey: "PCK",
        jira: sprintSource({
          12: [OCT_12],
          34: [{ id: 1400, name: "Estimation 7", state: "active" }],
        }),
        boards: [DELIVERY, ESTIMATES],
      }),
    Error,
    "Run 'ergon sprints PCK' to see open sprint ids.",
  );
});

Deno.test("a configured board settles a choice between active sprints", async () => {
  const jira = sprintSource({
    12: [OCT_12],
    34: [{ id: 1400, name: "Estimation 7", state: "active" }],
  });
  const sprintId = await resolveSprintId({
    projectKey: "PCK",
    jira,
    boards: [DELIVERY, ESTIMATES],
    configuredBoardId: "12",
  });

  assertEquals(sprintId, 1329);
  assertEquals(jira.asked, [12]);
});

Deno.test("a configured board outside the project's list is used anyway", async () => {
  // Jira is the authority on whether the board is usable; refusing here would
  // refuse a board the caller is entitled to.
  const sprintId = await resolveSprintId({
    projectKey: "PCK",
    jira: sprintSource({ 99: [OCT_12] }),
    boards: [DELIVERY],
    configuredBoardId: 99,
  });

  assertEquals(sprintId, 1329);
});

Deno.test("no active sprint on any board refuses", async () => {
  await assertRejects(
    () =>
      resolveSprintId({
        projectKey: "PCK",
        jira: sprintSource({ 12: [], 34: [] }),
        boards: [DELIVERY, ESTIMATES],
      }),
    Error,
    "No active sprint on Delivery (12), Estimates (34).",
  );
});

Deno.test("no board with sprints at all refuses", async () => {
  await assertRejects(
    () =>
      resolveSprintId({
        projectKey: "PCK",
        jira: sprintSource({}),
        boards: [SUPPORT],
      }),
    Error,
    "No board available to resolve the sprint.",
  );
});

Deno.test("a project with no declared sprint field id cannot be written to", () => {
  assertThrows(
    () => requireSprintFieldId(undefined, "PGR"),
    Error,
    "defaults.projects.PGR.fields.sprintFieldId",
  );
});

Deno.test("a sprint asked for by name is matched among the active ones", async () => {
  const sprintId = await resolveSprintId({
    projectKey: "PCK",
    jira: sprintSource({
      12: [OCT_12],
      34: [{ id: 1400, name: "Estimation 7", state: "active" }],
    }),
    boards: [DELIVERY, ESTIMATES],
    name: "estimation 7",
  });

  assertEquals(sprintId, 1400);
});

Deno.test("a sprint name matching nothing active refuses", async () => {
  await assertRejects(
    () =>
      resolveSprintId({
        projectKey: "PCK",
        jira: sprintSource({ 12: [OCT_12] }),
        boards: [DELIVERY],
        name: "Oct 5 - 9",
      }),
    Error,
    "Active sprint \"Oct 5 - 9\" not found. Run 'ergon sprints PCK' to see open sprint ids.",
  );
});

const OCT_19 = {
  id: 1335,
  name: "Oct 19 - 23",
  state: "future",
  startDate: "2026-10-19T04:00:00.000Z",
  endDate: "2026-10-23T04:00:00.000Z",
};
const NOV_2 = { id: 1341, name: "Nov 2 - 6", state: "future" };
const ESTIMATION_7 = { id: 1400, name: "Estimation 7", state: "active" };

/** A Jira that answers per board with its open Sprints, in board sequence. */
function openSprintSource(byBoard: Record<number, JiraSprint[]>) {
  return {
    listOpenSprints(boardId: number): Promise<JiraSprint[]> {
      return Promise.resolve(byBoard[boardId] ?? []);
    },
  };
}

Deno.test("a board that holds no sprints is not one to list", () => {
  assertEquals(scrumBoards([SUPPORT, DELIVERY], "PCK"), [DELIVERY]);
});

Deno.test("a project with no scrum board refuses rather than listing nothing", () => {
  assertThrows(
    () => scrumBoards([SUPPORT], "PCK"),
    Error,
    "No scrum board on PCK; it has no sprints.",
  );
});

Deno.test("open sprints report their dates, and null where Jira has none", async () => {
  const sprints = await listOpenSprints({
    jira: openSprintSource({ 12: [OCT_12, OCT_19] }),
    boards: [DELIVERY],
  });

  assertEquals(sprints, [
    {
      id: 1329,
      name: "Oct 12 - 16",
      state: "active",
      startDate: null,
      endDate: null,
      boards: [{ id: 12, name: "Delivery" }],
    },
    {
      id: 1335,
      name: "Oct 19 - 23",
      state: "future",
      startDate: "2026-10-19T04:00:00.000Z",
      endDate: "2026-10-23T04:00:00.000Z",
      boards: [{ id: 12, name: "Delivery" }],
    },
  ]);
});

Deno.test("a sprint shared by boards is listed once, naming each board", async () => {
  const sprints = await listOpenSprints({
    jira: openSprintSource({ 12: [OCT_12], 34: [OCT_12] }),
    boards: [DELIVERY, ESTIMATES],
  });

  assertEquals(sprints.map((sprint) => sprint.boards), [[
    { id: 12, name: "Delivery" },
    { id: 34, name: "Estimates" },
  ]]);
});

Deno.test("active sprints lead, then future ones in board sequence by first appearance", async () => {
  const sprints = await listOpenSprints({
    jira: openSprintSource({
      12: [OCT_12, NOV_2, OCT_19],
      34: [ESTIMATION_7, OCT_19],
    }),
    boards: [DELIVERY, ESTIMATES],
  });

  assertEquals(sprints.map((sprint) => sprint.id), [1329, 1400, 1341, 1335]);
});

Deno.test("no open sprint on any board is an empty listing", async () => {
  const sprints = await listOpenSprints({
    jira: openSprintSource({}),
    boards: [DELIVERY],
  });

  assertEquals(sprints, []);
});
