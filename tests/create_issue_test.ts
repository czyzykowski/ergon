import { assertEquals } from "testing/asserts.ts";
import { stub } from "testing/mock.ts";
import { JiraClient } from "../src/api/jira.ts";

const CLIENT_CONFIG = {
  baseUrl: "https://jira.example",
  email: "me@example.com",
  apiToken: "token",
};

Deno.test("a created issue is only the id and key Jira answers with", async () => {
  // Jira's whole answer to a create: no fields, so nothing to read a summary,
  // status or type from.
  using _fetch = stub(globalThis, "fetch", () =>
    Promise.resolve(Response.json({
      id: "10012",
      key: "PCK-12",
      self: "https://jira.example/rest/api/3/issue/10012",
    })));

  const issue = await new JiraClient(CLIENT_CONFIG).createIssue({
    projectKey: "PCK",
    summary: "Fix login redirect",
    issueType: "Task",
  });

  assertEquals(issue, { id: "10012", key: "PCK-12" });
});
