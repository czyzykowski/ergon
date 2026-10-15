import { assertEquals } from "testing/asserts.ts";
import { renderSprints } from "../src/commands/sprints.ts";
import type { OpenSprint } from "../src/sprint.ts";

const DELIVERY = { id: 26, name: "Delivery" };
const PCK = { id: 373, name: "PCK" };

// Midday UTC, so the local day is the same day in every timezone a test runs in.
const ACTIVE: OpenSprint = {
  id: 1842,
  name: "PCK Sprint 41",
  state: "active",
  startDate: "2026-10-06T12:00:00.000Z",
  endDate: "2026-10-20T12:00:00.000Z",
  boards: [PCK, DELIVERY],
};

const NEXT: OpenSprint = {
  id: 1851,
  name: "PCK Sprint 42",
  state: "future",
  startDate: null,
  endDate: null,
  boards: [PCK],
};

Deno.test("open sprints read as a table, id first, with a dash for a missing date", () => {
  assertEquals(
    renderSprints([ACTIVE, NEXT], [PCK, DELIVERY]),
    [
      "ID    STATE   NAME           START       END         BOARDS",
      "1842  active  PCK Sprint 41  2026-10-06  2026-10-20  PCK (373), Delivery (26)",
      "1851  future  PCK Sprint 42  —           —           PCK (373)",
    ].join("\n"),
  );
});

Deno.test("no open sprints names the boards that were asked", () => {
  assertEquals(
    renderSprints([], [PCK, DELIVERY]),
    "No open sprints on PCK (373), Delivery (26).",
  );
});
