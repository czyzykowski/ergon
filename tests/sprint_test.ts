import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { resolveSprintId, selectSprintBoard } from "../src/sprint.ts";
import type { JiraSprint } from "../src/api/jira.ts";

const DELIVERY = { id: 12, name: "Delivery" };
const TRIAGE = { id: 34, name: "Triage" };

function sprintSource(sprints: JiraSprint[]) {
  return {
    listActiveSprints(_boardId: number): Promise<JiraSprint[]> {
      return Promise.resolve(sprints);
    },
  };
}

Deno.test("one board needs no configuration", () => {
  assertEquals(selectSprintBoard([DELIVERY]), 12);
});

Deno.test("a configured board wins over the project's board list", () => {
  assertEquals(selectSprintBoard([DELIVERY, TRIAGE], 34), 34);
});

Deno.test("a configured board id arrives from YAML as a string", () => {
  assertEquals(selectSprintBoard([DELIVERY, TRIAGE], "34"), 34);
});

Deno.test("several boards with none configured refuses, naming the fix", () => {
  assertThrows(
    () => selectSprintBoard([DELIVERY, TRIAGE]),
    Error,
    "sprintBoardId",
  );
});

Deno.test("a configured board outside the project's list is used anyway", () => {
  // Jira is the authority on whether the board is usable; refusing here would
  // refuse a board the caller is entitled to.
  assertEquals(selectSprintBoard([DELIVERY], 99), 99);
});

Deno.test("no boards at all refuses", () => {
  assertThrows(
    () => selectSprintBoard([]),
    Error,
    "No board available to resolve the sprint.",
  );
});

Deno.test("the active sprint is the board's first", async () => {
  const sprintId = await resolveSprintId({
    jira: sprintSource([{ id: 7, name: "Sprint 40", state: "active" }]),
    boards: [DELIVERY],
  });

  assertEquals(sprintId, 7);
});

Deno.test("a board with no active sprint refuses", async () => {
  await assertRejects(
    () =>
      resolveSprintId({
        jira: sprintSource([]),
        boards: [DELIVERY],
      }),
    Error,
    "No active sprint found for the board.",
  );
});
