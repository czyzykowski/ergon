import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { mapIssue, searchFields } from "../src/api/jira.ts";
import type { JiraIssueResponse } from "../src/api/jira.ts";
import type { ProjectDefaults } from "../src/types.ts";

const SPRINT_FIELD = "customfield_10010";
const SOW_FIELD = "customfield_10200";

const PROJECTS: Record<string, ProjectDefaults> = {
  PCK: { fields: { sprintFieldId: SPRINT_FIELD, clientSowFieldId: SOW_FIELD } },
};

/** As Jira answers a search: no `issuelinks`, custom fields by id. */
function searched(
  fields: Record<string, unknown> = {},
): JiraIssueResponse {
  return {
    id: "10001",
    key: "PCK-12",
    fields: {
      summary: "Fix the redirect",
      status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
      issuetype: { name: "Task" },
      project: { key: "PCK" },
      created: "2026-09-01T09:00:00.000+0100",
      updated: "2026-09-17T11:30:00.000+0100",
      ...fields,
    },
  } as JiraIssueResponse;
}

const CARRIED_OVER = [
  { id: 1293, name: "Aug 24 - 28", state: "closed", boardId: 26 },
  { id: 1296, name: "Sep 14 - 19", state: "active", boardId: 26 },
  { id: 1295, name: "Sep 7 - 11", state: "closed", boardId: 26 },
];

Deno.test("an issue carries its priority, due date, sprints and Client SOW", () => {
  const issue = mapIssue(
    searched({
      priority: { name: "Medium", id: "3" },
      duedate: "2026-09-24",
      [SPRINT_FIELD]: [{ id: 1296, name: "Sep 14 - 19", state: "active" }],
      [SOW_FIELD]: { id: "10080", value: "Peacock: Marketing" },
    }),
    PROJECTS,
  );

  assertEquals(issue.priority, "Medium");
  assertEquals(issue.dueDate, "2026-09-24");
  assertEquals(issue.sprints, [{ name: "Sep 14 - 19", state: "active" }]);
  assertEquals(issue.clientSow, "Peacock: Marketing");
});

Deno.test("a fetched field Jira had nothing for is null, not absent", () => {
  const issue = mapIssue(
    searched({ priority: null, duedate: null, [SOW_FIELD]: null }),
    PROJECTS,
  );

  assertEquals(issue.priority, null);
  assertEquals(issue.dueDate, null);
  assertEquals(issue.clientSow, null);
  assert("clientSow" in issue);
});

Deno.test("sprints keep Jira's order, which is the board's and not chronology", () => {
  const issue = mapIssue(
    searched({ [SPRINT_FIELD]: CARRIED_OVER }),
    PROJECTS,
  );

  assertEquals(issue.sprints, [
    { name: "Aug 24 - 28", state: "closed" },
    { name: "Sep 14 - 19", state: "active" },
    { name: "Sep 7 - 11", state: "closed" },
  ]);
});

Deno.test("an issue planned into a future sprint is not an issue in none", () => {
  const planned = mapIssue(
    searched({
      [SPRINT_FIELD]: [{ id: 1300, name: "Sep 21 - 25", state: "future" }],
    }),
    PROJECTS,
  );
  const unplanned = mapIssue(searched({ [SPRINT_FIELD]: null }), PROJECTS);

  assertEquals(planned.sprints, [{ name: "Sep 21 - 25", state: "future" }]);
  assertEquals(unplanned.sprints, []);
});

Deno.test("a project ergon has no sprint field id for reports Absent sprints", () => {
  const issue = mapIssue(searched({ [SPRINT_FIELD]: CARRIED_OVER }), {});

  assertFalse("sprints" in issue);
  assertEquals(JSON.stringify(issue).includes("sprints"), false);
});

Deno.test("a project ergon has no Client SOW field id for reports it Absent", () => {
  const issue = mapIssue(
    searched({ [SOW_FIELD]: { value: "Peacock: Marketing" } }),
    { PCK: { fields: { sprintFieldId: SPRINT_FIELD } } },
  );

  assertFalse("clientSow" in issue);
  assert("sprints" in issue);
});

Deno.test("a searched issue has no links key, because nobody asked Jira", () => {
  const issue = mapIssue(searched(), PROJECTS);

  assertFalse("links" in issue);
});

Deno.test("a fetched issue carries its links, empty or not", () => {
  const issue = mapIssue(searched({ issuelinks: [] }), PROJECTS);

  assert("links" in issue);
  assertEquals(issue.links, []);
});

Deno.test("a search asks for every declared project's custom fields, once", () => {
  const fields = searchFields({
    PCK: {
      fields: { sprintFieldId: SPRINT_FIELD, clientSowFieldId: SOW_FIELD },
    },
    PGR: {
      fields: {
        sprintFieldId: SPRINT_FIELD,
        clientSowFieldId: "customfield_10300",
      },
    },
  });

  assertEquals(fields.filter((field) => field === SPRINT_FIELD).length, 1);
  assert(fields.includes(SOW_FIELD));
  assert(fields.includes("customfield_10300"));
  assert(fields.includes("priority"));
  assert(fields.includes("duedate"));
  assertFalse(fields.includes("issuelinks"));
});
