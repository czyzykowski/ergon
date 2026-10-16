import { assertEquals } from "testing/asserts.ts";
import { statusSinceFrom } from "../src/api/jira.ts";

const CREATED = "2026-08-01T09:12:00.000+0100";

/** As bulkfetch answers: `created` in epoch milliseconds, not Jira's string. */
function transition(created: string, from: string, to: string) {
  return {
    created: Date.parse(created),
    items: [{ fieldId: "status", fromString: from, toString: to }],
  };
}

Deno.test("an issue never transitioned has sat in its status since creation", () => {
  assertEquals(statusSinceFrom([], CREATED), "2026-08-01T08:12:00.000Z");
});

Deno.test("a move within one status category is a Transition", () => {
  const since = statusSinceFrom(
    [transition("2026-09-03T14:00:00.000Z", "In Progress", "Ready for QA")],
    CREATED,
  );

  assertEquals(since, "2026-09-03T14:00:00.000Z");
});

Deno.test("a remap that keeps the status name is not a Transition", () => {
  const since = statusSinceFrom(
    [
      transition("2026-09-03T14:00:00.000Z", "In Progress", "Ready for QA"),
      transition("2026-09-20T10:00:00.000Z", "Ready for QA", "Ready for QA"),
    ],
    CREATED,
  );

  assertEquals(since, "2026-09-03T14:00:00.000Z");
});

Deno.test("the latest Transition wins by the clock, not by position", () => {
  const since = statusSinceFrom(
    [
      transition("2026-09-10T08:00:00.000Z", "Ready for QA", "In Progress"),
      transition("2026-09-03T14:00:00.000Z", "In Progress", "Ready for QA"),
    ],
    CREATED,
  );

  assertEquals(since, "2026-09-10T08:00:00.000Z");
});

Deno.test("an edit to another field is not a Transition", () => {
  const since = statusSinceFrom(
    [{
      created: Date.parse("2026-09-03T14:00:00.000Z"),
      items: [{ fieldId: "labels", fromString: "", toString: "backend" }],
    }],
    CREATED,
  );

  assertEquals(since, "2026-08-01T08:12:00.000Z");
});
