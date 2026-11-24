import { assertEquals, assertThrows } from "testing/asserts.ts";
import { stub } from "testing/mock.ts";
import { JiraClient } from "../src/api/jira.ts";
import { assigneeField, parseAssignee } from "../src/commands/new_issue.ts";
import type { AssigneeField } from "../src/types.ts";

const ME = "5b10ac8d82e05b22cc7d4ef5";

Deno.test("--assignee takes 'me' and 'none' in any case", () => {
  assertEquals(parseAssignee("me"), "me");
  assertEquals(parseAssignee(" Me "), "me");
  assertEquals(parseAssignee("none"), "none");
  assertEquals(parseAssignee("NONE"), "none");
});

Deno.test("--assignee refuses a person's name rather than guessing at it", () => {
  assertThrows(
    () => parseAssignee("bobby"),
    Error,
    "--assignee takes 'me' or 'none'.",
  );
});

Deno.test("'me' is the account ergon's credentials belong to", async () => {
  assertEquals(await assigneeField("me", () => Promise.resolve(ME)), {
    accountId: ME,
  });
});

Deno.test("'none' is nobody, without asking Jira who the operator is", async () => {
  assertEquals(
    await assigneeField("none", () => {
      throw new Error("asked for the account");
    }),
    null,
  );
});

const CLIENT_CONFIG = {
  baseUrl: "https://jira.example",
  email: "me@example.com",
  apiToken: "token",
};

/** Creates an issue against a stubbed Jira and returns the fields it sent. */
async function createdFields(
  assignee?: AssigneeField,
): Promise<Record<string, unknown>> {
  let sent: Record<string, unknown> = {};
  using _fetch = stub(globalThis, "fetch", (_input, init?) => {
    sent = JSON.parse(String((init as { body?: string }).body)).fields;
    return Promise.resolve(Response.json({
      id: "10012",
      key: "PCK-12",
      self: "https://jira.example/rest/api/3/issue/10012",
    }));
  });

  await new JiraClient(CLIENT_CONFIG).createIssue({
    projectKey: "PCK",
    summary: "Fix login redirect",
    issueType: "Task",
    assignee,
  });

  return sent;
}

Deno.test("an issue is created with its Assignee in the same request", async () => {
  assertEquals((await createdFields({ accountId: ME })).assignee, {
    accountId: ME,
  });
});

Deno.test("'none' creates an issue deliberately unassigned", async () => {
  const fields = await createdFields(null);

  assertEquals("assignee" in fields, true);
  assertEquals(fields.assignee, null);
});

Deno.test("no --assignee sends nothing, leaving Jira's project default", async () => {
  assertEquals("assignee" in await createdFields(), false);
});
