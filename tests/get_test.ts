import { assertEquals } from "testing/asserts.ts";
import { renderIssue } from "../src/commands/get.ts";
import type { JiraIssue } from "../src/types.ts";

const ISSUE: JiraIssue = {
  id: "10012",
  key: "PCK-12",
  summary: "Fix login redirect",
  description: null,
  descriptionDegraded: [],
  status: "In Progress",
  statusCategory: "indeterminate",
  issueType: "Task",
  projectKey: "PCK",
  assignee: "Lukasz Czyzykowski",
  labels: [],
  created: "2026-08-01T09:12:00.000+0100",
  updated: "2026-08-14T11:04:31.000+0100",
  timeSpentSeconds: null,
  originalEstimateSeconds: null,
  priority: null,
  dueDate: null,
  links: [{
    id: "33550",
    phrase: "is blocked by",
    key: "PCK-9",
    summary: "Pin the runner image",
    status: "Done",
  }],
};

const HEADER = [
  "PCK-12 [In Progress] Fix login redirect",
  "  type:     Task",
  "  project:  PCK",
  "  assignee: Lukasz Czyzykowski",
  "  links:",
  "    is blocked by PCK-9 [Done] Pin the runner image",
];

Deno.test("an issue without a Description ends at its fields", () => {
  assertEquals(renderIssue(ISSUE), HEADER.join("\n"));
});

Deno.test("the Description follows the fields as unindented markdown", () => {
  const description = "- reproduce on staging\n  - check the 302 target";

  assertEquals(
    renderIssue({ ...ISSUE, description }),
    [...HEADER, "", description].join("\n"),
  );
});

Deno.test("a Degraded Description is named among the fields", () => {
  const rendered = renderIssue({
    ...ISSUE,
    description: "> Heads up: staging is shared",
    descriptionDegraded: ["media", "panel"],
  });

  assertEquals(rendered.split("\n").slice(3, 6), [
    "  assignee: Lukasz Czyzykowski",
    "  degraded: media, panel",
    "  links:",
  ]);
});
