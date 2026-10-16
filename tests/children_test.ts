import { assertEquals } from "testing/asserts.ts";
import { stub } from "testing/mock.ts";
import { childOf, JiraClient } from "../src/api/jira.ts";
import type { JiraIssue } from "../src/types.ts";

const CHILD: JiraIssue = {
  id: "10014",
  key: "PCK-14",
  summary: "Handle the 302 target",
  description: "Long body nobody listing Children needs",
  descriptionDegraded: [],
  status: "Ready for QA",
  statusCategory: "indeterminate",
  issueType: "Task",
  projectKey: "PCK",
  parentKey: "PCK-12",
  assignee: null,
  labels: ["auth"],
  created: "2026-08-01T09:12:00.000+0100",
  updated: "2026-08-14T11:04:31.000+0100",
  timeSpentSeconds: null,
  originalEstimateSeconds: null,
  priority: null,
  dueDate: null,
};

Deno.test("a Child carries what says how far along it is and who holds it", () => {
  assertEquals(childOf(CHILD), {
    key: "PCK-14",
    summary: "Handle the 302 target",
    issueType: "Task",
    status: "Ready for QA",
    statusCategory: "indeterminate",
    assignee: null,
  });
});

const ISSUE_RESPONSE = {
  id: "10012",
  key: "PCK-12",
  fields: {
    summary: "Fix login redirect",
    status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
    issuetype: { name: "Story" },
    project: { key: "PCK" },
    created: "2026-08-01T09:12:00.000+0100",
  },
};

const CHILD_RESPONSE = {
  id: "10014",
  key: "PCK-14",
  fields: {
    summary: "Handle the 302 target",
    status: { name: "Done", statusCategory: { key: "done" } },
    issuetype: { name: "Task" },
    project: { key: "PCK" },
    assignee: { displayName: "Jan Kowalski" },
  },
};

/**
 * Answers ergon's three reads for one issue — the issue, its changelog and its
 * Children — with the Children search answered by `children`.
 */
function stubJira(children: () => Response) {
  return stub(globalThis, "fetch", (input: string | URL | Request, init?) => {
    const url = String(input);
    if (url.endsWith("/search/jql")) {
      const body = JSON.parse(
        String((init as { body?: string } | undefined)?.body),
      );
      assertEquals(body.jql, "parent = PCK-12 ORDER BY key ASC");
      return Promise.resolve(children());
    }
    if (url.endsWith("/changelog/bulkfetch")) {
      return Promise.resolve(Response.json({ issueChangeLogs: [] }));
    }
    return Promise.resolve(Response.json(ISSUE_RESPONSE));
  });
}

const CLIENT_CONFIG = {
  baseUrl: "https://jira.example",
  email: "me@example.com",
  apiToken: "token",
};

Deno.test("getIssue lists every direct Child, Done ones included", async () => {
  using _fetch = stubJira(() => Response.json({ issues: [CHILD_RESPONSE] }));

  const issue = await new JiraClient(CLIENT_CONFIG).getIssue("PCK-12");

  assertEquals(issue.children, [{
    key: "PCK-14",
    summary: "Handle the 302 target",
    issueType: "Task",
    status: "Done",
    statusCategory: "done",
    assignee: "Jan Kowalski",
  }]);
});

Deno.test("an issue with no Children reports an empty list", async () => {
  using _fetch = stubJira(() => Response.json({ issues: [] }));

  const issue = await new JiraClient(CLIENT_CONFIG).getIssue("PCK-12");

  assertEquals(issue.children, []);
});

Deno.test("Children that cannot be searched are Absent, not empty", async () => {
  using _fetch = stubJira(() => new Response("boom", { status: 500 }));
  using _stderr = stub(console, "error");

  const issue = await new JiraClient(CLIENT_CONFIG).getIssue("PCK-12");

  assertEquals("children" in issue, false);
  assertEquals(issue.key, "PCK-12");
});
