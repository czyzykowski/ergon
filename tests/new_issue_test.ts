import { assertEquals, assertRejects } from "testing/asserts.ts";
import type { JiraSprint } from "../src/api/jira.ts";
import {
  fileNewIssue,
  isNoneValue,
  type NewIssueDraft,
  parseLabels,
} from "../src/commands/new_issue.ts";
import type { NewIssueJira } from "../src/commands/new_jira.ts";
import type { Prompter } from "../src/commands/new_prompter.ts";
import type {
  CachedIssue,
  CachedOption,
  ErgonConfig,
  ErgonState,
  JiraIssue,
  ProjectFieldDefaults,
} from "../src/types.ts";

const SOW_FIELD = "customfield_10200";
const SPRINT_FIELD = "customfield_10010";

type CreateInput = Parameters<NewIssueJira["createIssue"]>[0];

interface JiraFixtures {
  epics?: CachedIssue[];
  labels?: string[];
  options?: CachedOption[];
  boards?: { id: number; name: string; type?: string }[];
  sprints?: Record<number, JiraSprint[]>;
  matches?: Pick<JiraIssue, "key" | "summary">[];
  issueFields?: Record<string, Record<string, unknown>>;
  createFails?: boolean;
}

/** Answers from fixtures and records every call and every create payload. */
function fakeJira(fixtures: JiraFixtures = {}) {
  const calls: string[] = [];
  const created: CreateInput[] = [];

  const jira: NewIssueJira = {
    listEpics(projectKey) {
      calls.push(`listEpics ${projectKey}`);
      return Promise.resolve(fixtures.epics ?? []);
    },
    listLabels() {
      calls.push("listLabels");
      return Promise.resolve(fixtures.labels ?? []);
    },
    getFieldOptions(fieldId) {
      calls.push(`getFieldOptions ${fieldId}`);
      return Promise.resolve(fixtures.options ?? []);
    },
    listBoards(projectKey) {
      calls.push(`listBoards ${projectKey}`);
      return Promise.resolve(fixtures.boards ?? []);
    },
    listActiveSprints(boardId) {
      calls.push(`listActiveSprints ${boardId}`);
      return Promise.resolve(fixtures.sprints?.[boardId] ?? []);
    },
    search(jql, maxResults) {
      calls.push(`search ${jql} ${maxResults}`);
      return Promise.resolve(
        (fixtures.matches ?? []) as Awaited<ReturnType<NewIssueJira["search"]>>,
      );
    },
    getIssueFields(issueKey, fields) {
      calls.push(`getIssueFields ${issueKey} ${fields.join(",")}`);
      return Promise.resolve(fixtures.issueFields?.[issueKey] ?? {});
    },
    getMyAccountId() {
      calls.push("getMyAccountId");
      return Promise.resolve("me-123");
    },
    createIssue(input) {
      calls.push("createIssue");
      if (fixtures.createFails) {
        return Promise.reject(new Error("Jira said no"));
      }
      created.push(input);
      return Promise.resolve({ id: "1", key: "PCK-11" });
    },
  };

  return { jira, calls, created };
}

type Step = [keyof Prompter, unknown];

/**
 * Answers each question with the next scripted answer, and fails on a question
 * out of turn or past the end of the script.
 */
function scriptedPrompter(script: Step[] = []) {
  const asked: (keyof Prompter)[] = [];
  const args: Partial<Record<keyof Prompter, unknown[]>> = {};

  function answer(method: keyof Prompter) {
    return (...given: unknown[]) => {
      const step = script[asked.length];
      asked.push(method);
      args[method] = given;

      if (!step || step[0] !== method) {
        return Promise.reject(
          new Error(
            `Unexpected Prompter.${method}(); expected ${step?.[0] ?? "none"}`,
          ),
        );
      }

      return Promise.resolve(step[1]);
    };
  }

  const prompter = {
    project: answer("project"),
    epic: answer("epic"),
    summary: answer("summary"),
    parentQuery: answer("parentQuery"),
    parent: answer("parent"),
    labels: answer("labels"),
    clientSow: answer("clientSow"),
    board: answer("board"),
    sprint: answer("sprint"),
  } as Prompter;

  return { prompter, asked, args };
}

const FIELDS: ProjectFieldDefaults = {
  clientSowFieldId: SOW_FIELD,
  clientSowValue: "Client SOW A",
  labels: ["client-a"],
  sprintFieldId: SPRINT_FIELD,
};

function configWith(fields: ProjectFieldDefaults = FIELDS): ErgonConfig {
  return {
    jira: { baseUrl: "https://jira.invalid", email: "e", apiToken: "t" },
    clockwork: { baseUrl: "https://clockwork.invalid", apiToken: "t" },
    projects: { PCK: "Pickaxe", PGR: "Programme" },
    defaults: { projects: { PCK: { fields }, PGR: { fields } } },
  };
}

const SOW_OPTIONS: CachedOption[] = [
  { id: "10001", value: "Client SOW A" },
  { id: "10084", value: "Pickaxe: Internal Projects" },
];

/** A Parent's raw Jira fields, as `getIssueFields` returns them. */
const PARENT_LABELLED = {
  [SOW_FIELD]: { id: "10084", value: "Pickaxe: Internal Projects" },
  labels: ["Druid", "Infrastructure"],
};

const PARENT_BARE = { labels: [] };

const REMEMBERED: ErgonState = {
  lastProject: "PGR",
  lastEpic: "PGR-1",
  lastIssueKey: "PGR-2",
  lastClientSow: "10099",
};

interface Run {
  draft?: NewIssueDraft;
  fixtures?: JiraFixtures;
  script?: Step[];
  interactive?: boolean;
  fields?: ProjectFieldDefaults;
  state?: ErgonState;
  useCache?: boolean;
}

/** One `fileNewIssue` call, with its fakes kept for the assertions. */
async function run(options: Run = {}) {
  const jira = fakeJira(options.fixtures);
  const prompts = scriptedPrompter(options.script);
  const result = await fileNewIssue(
    { summary: "A summary", ...options.draft },
    {
      config: configWith(options.fields),
      state: options.state ?? REMEMBERED,
      interactive: options.interactive ?? false,
      prompter: prompts.prompter,
      jira: jira.jira,
      useCache: options.useCache ?? true,
    },
  );

  return { ...result, ...jira, ...prompts };
}

Deno.test("a Non-interactive run inherits both fields from a populated Parent", async () => {
  const { created, asked } = await run({
    draft: { project: "PCK", parent: "PCK-5" },
    fixtures: { issueFields: { "PCK-5": PARENT_LABELLED } },
  });

  assertEquals(created, [{
    projectKey: "PCK",
    summary: "A summary",
    issueType: "Task",
    description: undefined,
    parentKey: "PCK-5",
    labels: ["Druid", "Infrastructure"],
    assignee: undefined,
    customFields: { [SOW_FIELD]: { id: "10084" } },
  }]);
  assertEquals(asked, []);
});

/** The labels and Client SOW of the one issue a run created. */
function fieldsOf(created: CreateInput[]) {
  assertEquals(created.length, 1);
  return {
    labels: created[0].labels,
    clientSow: created[0].customFields?.[SOW_FIELD],
  };
}

// Resolving labels and the Client SOW, Non-interactive

Deno.test("a Non-interactive run falls through a bare Parent to config", async () => {
  const { created } = await run({
    draft: { project: "PCK", parent: "PCK-5" },
    fixtures: { issueFields: { "PCK-5": PARENT_BARE }, options: SOW_OPTIONS },
  });

  assertEquals(fieldsOf(created), {
    labels: ["client-a"],
    clientSow: { id: "10001" },
  });
});

Deno.test("a Non-interactive run never reads Remembered state", async () => {
  const { created, calls } = await run({
    draft: { project: "PCK", parent: "PCK-5" },
    fields: { clientSowFieldId: SOW_FIELD, sprintFieldId: SPRINT_FIELD },
    fixtures: { issueFields: { "PCK-5": PARENT_BARE } },
  });

  assertEquals(fieldsOf(created), { labels: undefined, clientSow: undefined });
  assertEquals(created[0].projectKey, "PCK");
  assertEquals(calls.includes(`getFieldOptions ${SOW_FIELD}`), false);
});

Deno.test("a Non-interactive run with no --project takes config's, not the remembered one", async () => {
  const jira = fakeJira();
  const config = configWith();
  config.defaults = { ...config.defaults, project: "PCK" };

  await fileNewIssue({ summary: "A summary", parent: "PCK-5" }, {
    config,
    state: REMEMBERED,
    interactive: false,
    prompter: scriptedPrompter().prompter,
    jira: jira.jira,
    useCache: true,
  });

  assertEquals(jira.created[0].projectKey, "PCK");
});

Deno.test("a Non-interactive run with no project anywhere is refused", async () => {
  await assertRejects(
    () => run({ draft: { parent: "PCK-5" } }),
    Error,
    "Project key is required; pass --project.",
  );
});

Deno.test("a Non-interactive run with no summary is refused", async () => {
  await assertRejects(
    () =>
      fileNewIssue({ project: "PCK", parent: "PCK-5" }, {
        config: configWith(),
        state: REMEMBERED,
        interactive: false,
        prompter: scriptedPrompter().prompter,
        jira: fakeJira().jira,
        useCache: true,
      }),
    Error,
    "Summary is required; pass --summary.",
  );
});

Deno.test("a Non-interactive run never calls the Prompter", async () => {
  // Everything an Interactive run would ask is left open here: Epic, Parent,
  // labels, Client SOW, board and Sprint.
  const { asked, created } = await run({
    draft: { project: "PCK" },
    fields: { sprintFieldId: SPRINT_FIELD, sprintBoardId: 7 },
    fixtures: {
      epics: [{ key: "PCK-10", summary: "An epic" }],
      boards: [{ id: 7, name: "Board" }, { id: 8, name: "Other" }],
      sprints: { 7: [{ id: 5, name: "Sprint 5" }] },
    },
  });

  assertEquals(asked, []);
  assertEquals(created[0].customFields, {});
});

Deno.test("a Non-interactive run Inherits from --epic when no --parent is given", async () => {
  const { created, calls } = await run({
    draft: { project: "PCK", epic: "PCK-10" },
    fixtures: { issueFields: { "PCK-10": PARENT_LABELLED } },
  });

  assertEquals(calls[0], `getIssueFields PCK-10 ${SOW_FIELD},labels`);
  assertEquals(created[0].parentKey, "PCK-10");
  assertEquals(fieldsOf(created), {
    labels: ["Druid", "Infrastructure"],
    clientSow: { id: "10084" },
  });
});

Deno.test("explicit labels replace Inherited ones", async () => {
  const { created } = await run({
    draft: { project: "PCK", parent: "PCK-5", labels: "urgent, spike" },
    fixtures: { issueFields: { "PCK-5": PARENT_LABELLED } },
  });

  assertEquals(created[0].labels, ["urgent", "spike"]);
});

Deno.test("--labels none clears Inherited labels in both modes", async () => {
  for (const interactive of [true, false]) {
    const { created, asked } = await run({
      interactive,
      draft: {
        project: "PCK",
        parent: "PCK-5",
        labels: "NONE ",
        clientSow: "none",
        sprint: "none",
      },
      fixtures: { issueFields: { "PCK-5": PARENT_LABELLED } },
    });

    assertEquals(created[0].labels, undefined);
    assertEquals(asked, []);
  }
});

Deno.test("none is only a sentinel when it is the whole --labels value", async () => {
  const { created } = await run({
    draft: { project: "PCK", parent: "PCK-5", labels: "none,urgent" },
  });

  assertEquals(created[0].labels, ["none", "urgent"]);
});

Deno.test("--client-sow none clears an Inherited Client SOW", async () => {
  const { created } = await run({
    draft: { project: "PCK", parent: "PCK-5", clientSow: "none" },
    fixtures: { issueFields: { "PCK-5": PARENT_LABELLED } },
  });

  assertEquals(created[0].customFields, {});
});

Deno.test("--client-sow overrides an Inherited one, matched to its option", async () => {
  const { created } = await run({
    draft: { project: "PCK", parent: "PCK-5", clientSow: "Client SOW A" },
    fixtures: {
      issueFields: { "PCK-5": PARENT_LABELLED },
      options: SOW_OPTIONS,
    },
  });

  assertEquals(fieldsOf(created).clientSow, { id: "10001" });
});

Deno.test("a --client-sow no option matches is sent as its value", async () => {
  const { created } = await run({
    draft: { project: "PCK", parent: "PCK-5", clientSow: "Client SOW B" },
    fixtures: { options: SOW_OPTIONS },
  });

  assertEquals(fieldsOf(created).clientSow, { value: "Client SOW B" });
});

Deno.test("a Parent's Client SOW without an id is Inherited as its value", async () => {
  const { created } = await run({
    draft: { project: "PCK", parent: "PCK-5" },
    fixtures: { issueFields: { "PCK-5": { [SOW_FIELD]: "Legacy SOW" } } },
  });

  assertEquals(fieldsOf(created).clientSow, { value: "Legacy SOW" });
});

Deno.test("a Parent's labels that are not strings are dropped", async () => {
  const { created } = await run({
    draft: { project: "PCK", parent: "PCK-5" },
    fixtures: {
      issueFields: {
        "PCK-5": {
          [SOW_FIELD]: {
            self:
              "https://example.atlassian.net/rest/api/3/customFieldOption/10084",
            value: "Pickaxe: Internal Projects",
            id: "10084",
          },
          labels: ["Druid", 7, "Prometheus"],
        },
      },
    },
  });

  assertEquals(fieldsOf(created), {
    labels: ["Druid", "Prometheus"],
    clientSow: { id: "10084" },
  });
});

Deno.test("a project with no Client SOW field Inherits labels alone", async () => {
  const { created, calls } = await run({
    draft: { project: "PCK", parent: "PCK-5" },
    fields: { sprintFieldId: SPRINT_FIELD },
    fixtures: {
      issueFields: {
        "PCK-5": { labels: ["Druid"], [SOW_FIELD]: { id: "10084" } },
      },
    },
  });

  assertEquals(calls[0], "getIssueFields PCK-5 labels");
  assertEquals(created[0].labels, ["Druid"]);
  assertEquals(created[0].customFields, {});
});

Deno.test("a Client SOW that needs a field is refused without one configured", async () => {
  const noSowField = { sprintFieldId: SPRINT_FIELD };

  await assertRejects(
    () =>
      run({
        draft: { project: "PCK", parent: "PCK-5", clientSow: "Client SOW A" },
        fields: noSowField,
      }),
    Error,
    "clientSowFieldId",
  );
  await assertRejects(
    () =>
      run({
        interactive: true,
        draft: { project: "PCK", parent: "PCK-5", labels: "a" },
        fields: noSowField,
      }),
    Error,
    "clientSowFieldId",
  );
});

// Resolving labels and the Client SOW, Interactive

/** An Interactive Story under no Epic, with no Sprint: only fields are asked. */
const INTERACTIVE_STORY: NewIssueDraft = {
  project: "PCK",
  type: "Story",
  epic: "none",
  sprint: "none",
};

Deno.test("an Interactive run takes a Parent's labels without asking", async () => {
  const { created, asked } = await run({
    interactive: true,
    draft: { ...INTERACTIVE_STORY, parent: "PCK-5" },
    fixtures: {
      issueFields: { "PCK-5": PARENT_LABELLED },
      options: SOW_OPTIONS,
    },
    script: [["clientSow", { id: "10084", value: "Pickaxe" }]],
  });

  assertEquals(created[0].labels, ["Druid", "Infrastructure"]);
  assertEquals(asked, ["clientSow"]);
});

Deno.test("an Interactive run asks for labels when there is no Parent and none configured", async () => {
  const { created, asked, args } = await run({
    interactive: true,
    draft: INTERACTIVE_STORY,
    fields: { clientSowFieldId: SOW_FIELD, sprintFieldId: SPRINT_FIELD },
    fixtures: { labels: ["a", "b"], options: SOW_OPTIONS },
    script: [["labels", ["b"]], ["clientSow", { id: "10001" }]],
  });

  assertEquals(asked, ["labels", "clientSow"]);
  assertEquals(args.labels, [["a", "b"]]);
  assertEquals(fieldsOf(created), {
    labels: ["b"],
    clientSow: { id: "10001" },
  });
});

Deno.test("an Interactive run with no Parent takes the configured labels", async () => {
  const { created, asked } = await run({
    interactive: true,
    draft: INTERACTIVE_STORY,
    script: [["clientSow", { id: "10001" }]],
  });

  assertEquals(created[0].labels, ["client-a"]);
  assertEquals(asked, ["clientSow"]);
});

Deno.test("an Interactive Client SOW prompt defaults to the Parent's", async () => {
  const { args } = await run({
    interactive: true,
    draft: { ...INTERACTIVE_STORY, parent: "PCK-5" },
    fixtures: {
      issueFields: { "PCK-5": PARENT_LABELLED },
      options: SOW_OPTIONS,
    },
    script: [["clientSow", { id: "10084" }]],
  });

  assertEquals(args.clientSow, [SOW_OPTIONS, "10084"]);
});

Deno.test("an Interactive Client SOW prompt defaults to Remembered state next", async () => {
  const { args } = await run({
    interactive: true,
    draft: { ...INTERACTIVE_STORY, labels: "a" },
    fixtures: { options: SOW_OPTIONS },
    script: [["clientSow", { id: "10099" }]],
  });

  assertEquals(args.clientSow, [SOW_OPTIONS, "10099"]);
});

Deno.test("an Interactive Client SOW prompt defaults to config last", async () => {
  const { args } = await run({
    interactive: true,
    draft: { ...INTERACTIVE_STORY, labels: "a" },
    state: {},
    fixtures: { options: SOW_OPTIONS },
    script: [["clientSow", { id: "10001" }]],
  });

  assertEquals(args.clientSow, [SOW_OPTIONS, "Client SOW A"]);
});

Deno.test("an Interactive --client-sow is matched, not asked", async () => {
  const { created, asked } = await run({
    interactive: true,
    draft: { ...INTERACTIVE_STORY, labels: "a", clientSow: "Client SOW A" },
    fixtures: { options: SOW_OPTIONS },
  });

  assertEquals(asked, []);
  assertEquals(fieldsOf(created).clientSow, { id: "10001" });
});

Deno.test("an Interactive run Inherits from the Epic it picks, ahead of Remembered state", async () => {
  const { created, calls, asked, args } = await run({
    interactive: true,
    draft: { project: "PCK", type: "Story", sprint: "none" },
    state: { lastClientSow: "10099" },
    fields: { clientSowFieldId: SOW_FIELD, sprintFieldId: SPRINT_FIELD },
    fixtures: {
      epics: [{ key: "PCK-10", summary: "An epic" }],
      issueFields: { "PCK-10": PARENT_LABELLED },
      labels: ["a"],
      options: SOW_OPTIONS,
    },
    script: [
      ["epic", "PCK-10"],
      ["clientSow", { id: "10084" }],
    ],
  });

  assertEquals(asked, ["epic", "clientSow"]);
  assertEquals(
    calls.filter((call) => call.startsWith("getIssueFields")),
    [`getIssueFields PCK-10 ${SOW_FIELD},labels`],
  );
  assertEquals(args.clientSow, [SOW_OPTIONS, "10084"]);
  assertEquals(created[0].parentKey, "PCK-10");
  assertEquals(created[0].labels, ["Druid", "Infrastructure"]);
});

Deno.test("an Interactive Parent with labels: [] falls through to the configured labels", async () => {
  const { created, asked } = await run({
    interactive: true,
    draft: { ...INTERACTIVE_STORY, parent: "PCK-5" },
    fixtures: {
      issueFields: { "PCK-5": PARENT_BARE },
      labels: ["a"],
      options: SOW_OPTIONS,
    },
    script: [["clientSow", { id: "10001" }]],
  });

  assertEquals(asked, ["clientSow"]);
  assertEquals(created[0].labels, ["client-a"]);
});

Deno.test("an Interactive Epic with labels: [] falls through to the configured labels", async () => {
  const { created, asked } = await run({
    interactive: true,
    draft: { project: "PCK", type: "Story", sprint: "none" },
    state: {},
    fixtures: {
      epics: [{ key: "PCK-10", summary: "An epic" }],
      issueFields: { "PCK-10": PARENT_BARE },
      labels: ["a"],
      options: SOW_OPTIONS,
    },
    script: [["epic", "PCK-10"], ["clientSow", { id: "10001" }]],
  });

  assertEquals(asked, ["epic", "clientSow"]);
  assertEquals(created[0].parentKey, "PCK-10");
  assertEquals(created[0].labels, ["client-a"]);
});

Deno.test("an Interactive Parent with labels: [] and none configured asks for labels", async () => {
  const { created, asked, args } = await run({
    interactive: true,
    draft: { ...INTERACTIVE_STORY, parent: "PCK-5" },
    fields: { clientSowFieldId: SOW_FIELD, sprintFieldId: SPRINT_FIELD },
    fixtures: {
      issueFields: { "PCK-5": PARENT_BARE },
      labels: ["a"],
      options: SOW_OPTIONS,
    },
    script: [["labels", ["a"]], ["clientSow", { id: "10001" }]],
  });

  assertEquals(asked, ["labels", "clientSow"]);
  assertEquals(args.labels, [["a"]]);
  assertEquals(created[0].labels, ["a"]);
});

// The drift ticket 06 fixes, pinned as it is today.

Deno.test("pinned drift: a Non-interactive --sprint <name> is refused", async () => {
  await assertRejects(
    () =>
      run({
        draft: { project: "PCK", parent: "PCK-5", sprint: "Sprint 5" },
        fields: { ...FIELDS, sprintBoardId: 7 },
        fixtures: { sprints: { 7: [{ id: 5, name: "Sprint 5" }] } },
      }),
    Error,
    "Resolving --sprint by name needs interactive mode",
  );
});

Deno.test("pinned drift: an Interactive --sprint <name> asks for a board first", async () => {
  const { created, asked } = await run({
    interactive: true,
    draft: { ...INTERACTIVE_STORY, labels: "a", sprint: "sprint 5" },
    fixtures: {
      options: SOW_OPTIONS,
      boards: [{ id: 7, name: "Board" }, { id: 8, name: "Other" }],
      sprints: { 7: [{ id: 5, name: "Sprint 5" }] },
    },
    script: [["clientSow", { id: "10001" }], ["board", 7]],
  });

  assertEquals(asked, ["clientSow", "board"]);
  assertEquals(created[0].customFields?.[SPRINT_FIELD], 5);
});

// Project, Epic, summary and Parent, Interactive

Deno.test("an Interactive run asks every question a bare draft leaves open", async () => {
  const jira = fakeJira({
    epics: [{ key: "PCK-10", summary: "An epic" }],
    matches: [{ key: "PCK-5", summary: "A story" }],
    issueFields: { "PCK-5": PARENT_LABELLED },
    options: SOW_OPTIONS,
    boards: [{ id: 7, name: "Board" }],
    sprints: { 7: [{ id: 5, name: "Sprint 5" }] },
  });
  const { prompter, asked, args } = scriptedPrompter([
    ["project", "PCK"],
    ["epic", "PCK-10"],
    ["summary", "Asked summary"],
    ["parentQuery", "druid"],
    ["parent", "PCK-5"],
    ["clientSow", { id: "10084", value: "Pickaxe: Internal Projects" }],
    ["sprint", 5],
  ]);

  const { issue } = await fileNewIssue({}, {
    config: configWith(),
    state: {},
    interactive: true,
    prompter,
    jira: jira.jira,
    useCache: true,
  });

  assertEquals(asked, [
    "project",
    "epic",
    "summary",
    "parentQuery",
    "parent",
    "clientSow",
    "sprint",
  ]);
  assertEquals(args.project, [{ PCK: "Pickaxe", PGR: "Programme" }]);
  assertEquals(args.parentQuery, [["Story"]]);
  assertEquals(args.parent, [[{ key: "PCK-5", summary: "A story" }], [
    "Story",
  ]]);
  assertEquals(
    jira.calls.find((call) => call.startsWith("search")),
    'search project = PCK AND issuetype in ("Story") AND text ~ "druid" ORDER BY updated DESC 20',
  );
  assertEquals(issue, { key: "PCK-11", summary: "Asked summary" });
  assertEquals(jira.created, [{
    projectKey: "PCK",
    summary: "Asked summary",
    issueType: "Task",
    description: undefined,
    parentKey: "PCK-5",
    labels: ["Druid", "Infrastructure"],
    assignee: undefined,
    customFields: { [SOW_FIELD]: { id: "10084" }, [SPRINT_FIELD]: 5 },
  }]);
});

Deno.test("an Interactive run defaults the project and Epic from Remembered state", async () => {
  const { created, asked } = await run({
    interactive: true,
    draft: { type: "Story", labels: "a", clientSow: "none", sprint: "none" },
  });

  assertEquals(asked, []);
  assertEquals(created[0].projectKey, "PGR");
  assertEquals(created[0].parentKey, "PGR-1");
});

Deno.test("an Interactive Sub-task asks for a Task Parent and no Epic", async () => {
  const { asked, args } = await run({
    interactive: true,
    draft: {
      project: "PCK",
      type: "Sub-task",
      labels: "a",
      clientSow: "none",
      sprint: "none",
    },
    state: {},
    script: [["parentQuery", "PCK-5"]],
  });

  assertEquals(asked, ["parentQuery"]);
  assertEquals(args.parentQuery, [["Task"]]);
});

Deno.test("an Interactive parent search with no matches is refused", async () => {
  await assertRejects(
    () =>
      run({
        interactive: true,
        draft: { project: "PCK", epic: "none" },
        script: [["parentQuery", "nothing"]],
      }),
    Error,
    "No matching parent issues found.",
  );
});

// Sprint

Deno.test("a numeric --sprint is written as it is", async () => {
  const { created, calls } = await run({
    draft: { project: "PCK", parent: "PCK-5", sprint: "42" },
  });

  assertEquals(created[0].customFields?.[SPRINT_FIELD], 42);
  assertEquals(calls.some((call) => call.startsWith("listBoards")), false);
});

Deno.test("the Active Sprint resolves from uncached boards", async () => {
  const { created, calls } = await run({
    draft: { project: "PCK", parent: "PCK-5", sprint: "active" },
    state: { cache: { boards: { PCK: [{ id: 3, name: "Stale board" }] } } },
    fixtures: {
      boards: [
        { id: 7, name: "Scrum", type: "scrum" },
        { id: 8, name: "Kanban", type: "kanban" },
      ],
      sprints: { 7: [{ id: 5, name: "Sprint 5" }] },
    },
  });

  assertEquals(
    calls.filter((call) => /^list(Boards|ActiveSprints)/.test(call)),
    ["listBoards PCK", "listActiveSprints 7"],
  );
  assertEquals(created[0].customFields?.[SPRINT_FIELD], 5);
});

Deno.test("an Interactive run with a configured board asks only for the Sprint", async () => {
  const { created, asked, args } = await run({
    interactive: true,
    draft: {
      ...INTERACTIVE_STORY,
      labels: "a",
      clientSow: "none",
      sprint: undefined,
    },
    fields: { ...FIELDS, sprintBoardId: 7 },
    fixtures: {
      boards: [{ id: 7, name: "Board" }, { id: 8, name: "Other" }],
      sprints: { 7: [{ id: 5, name: "Sprint 5" }] },
    },
    script: [["sprint", 5]],
  });

  assertEquals(asked, ["sprint"]);
  assertEquals(args.sprint, [[{ id: 5, name: "Sprint 5" }]]);
  assertEquals(created[0].customFields?.[SPRINT_FIELD], 5);
});

Deno.test("an Interactive run with no board writes no Sprint", async () => {
  const { created, asked } = await run({
    interactive: true,
    draft: {
      ...INTERACTIVE_STORY,
      labels: "a",
      clientSow: "none",
      sprint: undefined,
    },
  });

  assertEquals(asked, []);
  assertEquals(created[0].customFields, {});
});

// Assignee and Description

Deno.test("--assignee me asks Jira who me is; none sends null", async () => {
  const me = await run({
    draft: { project: "PCK", parent: "PCK-5", assignee: "me" },
  });
  const none = await run({
    draft: { project: "PCK", parent: "PCK-5", assignee: "none" },
  });

  assertEquals(me.created[0].assignee, { accountId: "me-123" });
  assertEquals(none.created[0].assignee, null);
  assertEquals(none.calls.includes("getMyAccountId"), false);
});

Deno.test("a blank Description is left out of the create", async () => {
  const blank = await run({
    draft: { project: "PCK", parent: "PCK-5", description: "  \n" },
  });
  const given = await run({
    draft: { project: "PCK", parent: "PCK-5", description: "Body" },
  });

  assertEquals(blank.created[0].description, undefined);
  assertEquals(given.created[0].description, "Body");
});

// The next state

const CREATED_INTERACTIVELY: Run = {
  interactive: true,
  draft: { project: "PCK", epic: "PCK-10", parent: "PCK-5", sprint: "none" },
  fixtures: {
    issueFields: { "PCK-5": PARENT_LABELLED },
    options: SOW_OPTIONS,
  },
  script: [["clientSow", { id: "10084", value: "Pickaxe" }]],
};

Deno.test("an Interactive run remembers its project, Epic, issue and Client SOW", async () => {
  const { state, issue } = await run(CREATED_INTERACTIVELY);

  assertEquals(issue, { key: "PCK-11", summary: "A summary" });
  assertEquals(state, {
    lastProject: "PCK",
    lastEpic: "PCK-10",
    lastIssueKey: "PCK-11",
    lastClientSow: "10084",
    cache: { clientSowOptions: { [SOW_FIELD]: SOW_OPTIONS } },
  });
});

Deno.test("an Interactive run that sets no Client SOW keeps the remembered one", async () => {
  const { state } = await run({
    ...CREATED_INTERACTIVELY,
    draft: { ...CREATED_INTERACTIVELY.draft, clientSow: "none" },
    script: [],
  });

  assertEquals(state.lastClientSow, "10099");
});

Deno.test("an Interactive run with no Epic remembers none", async () => {
  const { state } = await run({
    ...CREATED_INTERACTIVELY,
    draft: { ...CREATED_INTERACTIVELY.draft, epic: "none" },
  });

  assertEquals(state.lastEpic, undefined);
});

Deno.test("a Non-interactive run remembers only the issue it created", async () => {
  const { state } = await run({
    draft: { project: "PCK", epic: "PCK-10", parent: "PCK-5" },
    fixtures: { issueFields: { "PCK-5": PARENT_LABELLED } },
  });

  assertEquals(state, { ...REMEMBERED, lastIssueKey: "PCK-11", cache: {} });
});

Deno.test("a failed create returns no next state", async () => {
  await assertRejects(
    () =>
      run({
        draft: { project: "PCK", parent: "PCK-5" },
        fixtures: { createFails: true },
      }),
    Error,
    "Jira said no",
  );
});

// The Cache

const CACHE = {
  epics: { PCK: [{ key: "PCK-2", summary: "Cached epic" }] },
  labels: ["cached"],
};

/** An Interactive run that reads the epic list and the labels. */
const READS_EPICS_AND_LABELS: Run = {
  interactive: true,
  draft: { project: "PCK", type: "Story", clientSow: "none", sprint: "none" },
  fields: { sprintFieldId: SPRINT_FIELD },
  state: { cache: CACHE },
  fixtures: {
    epics: [{ key: "PCK-1", summary: "Fresh epic" }],
    labels: ["fresh"],
  },
};

Deno.test("a cached epic list is not refetched", async () => {
  const { calls, args } = await run({
    ...READS_EPICS_AND_LABELS,
    script: [["epic", undefined], ["labels", ["cached"]]],
  });

  assertEquals(args.epic, [CACHE.epics.PCK]);
  assertEquals(args.labels, [CACHE.labels]);
  assertEquals(calls, ["createIssue"]);
});

Deno.test("a list fetched past the Cache is kept in the next state", async () => {
  const { state } = await run({
    ...READS_EPICS_AND_LABELS,
    state: { cache: { labels: ["cached"] } },
    script: [["epic", undefined], ["labels", ["cached"]]],
  });

  assertEquals(state.cache, {
    labels: ["cached"],
    epics: { PCK: [{ key: "PCK-1", summary: "Fresh epic" }] },
  });
});

Deno.test("--no-cache asks Jira and leaves state.cache untouched", async () => {
  const { state, calls, args } = await run({
    ...READS_EPICS_AND_LABELS,
    useCache: false,
    script: [["epic", undefined], ["labels", ["fresh"]]],
  });

  assertEquals(args.epic, [[{ key: "PCK-1", summary: "Fresh epic" }]]);
  assertEquals(calls, ["listEpics PCK", "listLabels", "createIssue"]);
  assertEquals(state.cache, CACHE);
});

// Flag parsing `edit` shares

Deno.test("parseLabels trims, drops blanks, and returns undefined when empty", () => {
  assertEquals(parseLabels(" a , b ,, "), ["a", "b"]);
  assertEquals(parseLabels(" , "), undefined);
  assertEquals(parseLabels(""), undefined);
  assertEquals(parseLabels(undefined), undefined);
});

Deno.test("isNoneValue matches the sentinel case-insensitively", () => {
  assertEquals(isNoneValue(" None "), true);
  assertEquals(isNoneValue("none"), true);
  assertEquals(isNoneValue("nonexistent"), false);
  assertEquals(isNoneValue(undefined), false);
});
