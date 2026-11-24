import { assertEquals } from "testing/asserts.ts";
import { CachedJira, type NewIssueJira } from "../src/commands/new_jira.ts";
import type { CacheState } from "../src/types.ts";

/** Answers from fixtures and records every call, by method name. */
function fakeJira(): NewIssueJira & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    listEpics(projectKey) {
      calls.push(`listEpics ${projectKey}`);
      return Promise.resolve([{ key: "PCK-1", summary: "Fresh epic" }]);
    },
    listLabels() {
      calls.push("listLabels");
      return Promise.resolve(["fresh"]);
    },
    getFieldOptions(fieldId) {
      calls.push(`getFieldOptions ${fieldId}`);
      return Promise.resolve([{ id: "2", value: "Fresh SOW" }]);
    },
    listBoards(projectKey) {
      calls.push(`listBoards ${projectKey}`);
      return Promise.resolve([{ id: 7, name: "Fresh board", type: "scrum" }]);
    },
    listActiveSprints(boardId) {
      calls.push(`listActiveSprints ${boardId}`);
      return Promise.resolve([{ id: 5, name: "Sprint 5" }]);
    },
    search(jql, maxResults) {
      calls.push(`search ${jql} ${maxResults}`);
      return Promise.resolve([]);
    },
    getIssueFields(issueKey, fields) {
      calls.push(`getIssueFields ${issueKey} ${fields.join(",")}`);
      return Promise.resolve({ labels: ["parent"] });
    },
    getMyAccountId() {
      calls.push("getMyAccountId");
      return Promise.resolve("me-123");
    },
    createIssue(input) {
      calls.push(`createIssue ${input.summary}`);
      return Promise.resolve({ id: "1", key: "PCK-9" });
    },
  };
}

const CACHE: CacheState = {
  epics: { PCK: [{ key: "PCK-2", summary: "Cached epic" }] },
  labels: ["cached"],
  clientSowOptions: { customfield_1: [{ id: "1", value: "Cached SOW" }] },
  boards: { PCK: [{ id: 3, name: "Cached board" }] },
};

Deno.test("a cached epic list is served without a Jira call", async () => {
  const jira = fakeJira();
  const cached = new CachedJira(jira, CACHE);

  assertEquals(await cached.listEpics("PCK"), [
    { key: "PCK-2", summary: "Cached epic" },
  ]);
  assertEquals(jira.calls, []);
});

Deno.test("an epic list missing from the Cache is asked of Jira once and kept", async () => {
  const jira = fakeJira();
  const cached = new CachedJira(jira, {});

  await cached.listEpics("PCK");
  assertEquals(await cached.listEpics("PCK"), [
    { key: "PCK-1", summary: "Fresh epic" },
  ]);
  assertEquals(jira.calls, ["listEpics PCK"]);
  assertEquals(cached.cache.epics, {
    PCK: [{ key: "PCK-1", summary: "Fresh epic" }],
  });
});

Deno.test("cached labels, field options and boards are served without a Jira call", async () => {
  const jira = fakeJira();
  const cached = new CachedJira(jira, CACHE);

  assertEquals(await cached.listLabels(), ["cached"]);
  assertEquals(await cached.getFieldOptions("customfield_1"), [
    { id: "1", value: "Cached SOW" },
  ]);
  assertEquals(await cached.listBoards("PCK"), [
    { id: 3, name: "Cached board" },
  ]);
  assertEquals(jira.calls, []);
});

Deno.test("labels, field options and boards missing from the Cache are asked of Jira once and kept", async () => {
  const jira = fakeJira();
  const cached = new CachedJira(jira, {});

  for (let round = 0; round < 2; round++) {
    await cached.listLabels();
    await cached.getFieldOptions("customfield_1");
    await cached.listBoards("PCK");
  }

  assertEquals(jira.calls, [
    "listLabels",
    "getFieldOptions customfield_1",
    "listBoards PCK",
  ]);
  assertEquals(cached.cache, {
    labels: ["fresh"],
    clientSowOptions: { customfield_1: [{ id: "2", value: "Fresh SOW" }] },
    boards: { PCK: [{ id: 7, name: "Fresh board" }] },
  });
});

Deno.test("a miss for another key keeps what the Cache held, and leaves the caller's Cache as it was", async () => {
  const before = structuredClone(CACHE);
  const cached = new CachedJira(fakeJira(), CACHE);

  await cached.listEpics("PGR");
  await cached.getFieldOptions("customfield_2");
  await cached.listBoards("PGR");

  assertEquals(CACHE, before);
  assertEquals(cached.cache.epics, {
    PCK: [{ key: "PCK-2", summary: "Cached epic" }],
    PGR: [{ key: "PCK-1", summary: "Fresh epic" }],
  });
  assertEquals(Object.keys(cached.cache.clientSowOptions ?? {}), [
    "customfield_1",
    "customfield_2",
  ]);
  assertEquals(Object.keys(cached.cache.boards ?? {}), ["PCK", "PGR"]);
});

Deno.test("active sprints, search, issue fields, account id and create pass straight through, uncached", async () => {
  const jira = fakeJira();
  const cached = new CachedJira(jira, CACHE);

  for (let round = 0; round < 2; round++) {
    assertEquals(await cached.listActiveSprints(7), [
      { id: 5, name: "Sprint 5" },
    ]);
    assertEquals(await cached.search("text ~ x", 20), []);
    assertEquals(await cached.getIssueFields("PCK-1", ["labels"]), {
      labels: ["parent"],
    });
    assertEquals(await cached.getMyAccountId(), "me-123");
    assertEquals(
      await cached.createIssue({
        projectKey: "PCK",
        summary: "New",
        issueType: "Task",
      }),
      { id: "1", key: "PCK-9" },
    );
  }

  const once = [
    "listActiveSprints 7",
    "search text ~ x 20",
    "getIssueFields PCK-1 labels",
    "getMyAccountId",
    "createIssue New",
  ];
  assertEquals(jira.calls, [...once, ...once]);
  assertEquals(cached.cache, CACHE);
});
