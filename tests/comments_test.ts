import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { mapComment } from "../src/api/jira.ts";
import type { JiraCommentResponse } from "../src/api/jira.ts";
import { renderThread } from "../src/commands/comments.ts";
import type { JiraComment } from "../src/types.ts";

function paragraphs(...lines: string[]) {
  return {
    type: "doc",
    version: 1,
    content: lines.map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    })),
  };
}

const PLAIN: JiraCommentResponse = {
  id: "10234",
  author: { displayName: "Lukasz Czyzykowski" },
  body: paragraphs("Deployed to staging.", "Waiting on QA."),
  created: "2026-08-14T11:04:31.000+0100",
  updated: "2026-08-14T11:04:31.000+0100",
};

const TABULAR: JiraCommentResponse = {
  id: "10235",
  author: { displayName: "Ada Lovelace" },
  body: {
    type: "doc",
    version: 1,
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Results below" }] },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Case" }],
                }],
              },
              {
                type: "tableCell",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Result" }],
                }],
              },
            ],
          },
        ],
      },
    ],
  },
  created: "2026-08-15T09:20:00.000+0100",
  updated: "2026-08-15T09:22:41.000+0100",
};

const RESTRICTED: JiraCommentResponse = {
  id: "10236",
  author: { displayName: "Ada Lovelace" },
  body: paragraphs("Credentials rotated."),
  created: "2026-08-16T08:00:00.000+0100",
  updated: "2026-08-16T08:00:00.000+0100",
  visibility: { type: "role", value: "Developers" },
};

Deno.test("a plain comment maps to its text with nothing degraded", () => {
  assertEquals(mapComment(PLAIN), {
    id: "10234",
    author: "Lukasz Czyzykowski",
    body: "Deployed to staging.\n\nWaiting on QA.",
    bodyDegraded: [],
    created: "2026-08-14T11:04:31.000+0100",
    updated: "2026-08-14T11:04:31.000+0100",
  });
});

Deno.test("a comment Jira renders richer keeps its text and names what it lost", () => {
  const mapped = mapComment(TABULAR);

  assertEquals(
    mapped.body,
    "Results below\n\n| Case | Result |\n| --- | --- |",
  );
  assertEquals(mapped.bodyDegraded, ["table"]);
});

Deno.test("a restriction survives the mapping verbatim", () => {
  assertEquals(mapComment(RESTRICTED).visibility, {
    type: "role",
    value: "Developers",
  });
});

Deno.test("an unrestricted comment has no visibility key at all", () => {
  assertEquals("visibility" in mapComment(PLAIN), false);
});

Deno.test("timestamps are Jira's own strings, unparsed", () => {
  const mapped = mapComment(TABULAR);

  assertEquals(mapped.created, "2026-08-15T09:20:00.000+0100");
  assertEquals(mapped.updated, "2026-08-15T09:22:41.000+0100");
});

Deno.test("an author ergon cannot name maps to an empty string", () => {
  assertEquals(mapComment({ ...PLAIN, author: undefined }).author, "");
});

Deno.test("a thread prints a header per comment and indents the body", () => {
  assertEquals(
    renderThread([mapComment(PLAIN)]),
    [
      "10234  Lukasz Czyzykowski  2026-08-14 11:04",
      "  Deployed to staging.",
      "",
      "  Waiting on QA.",
    ].join("\n"),
  );
});

Deno.test("a comment revised since it was written says so", () => {
  const header = renderThread([mapComment(TABULAR)]).split("\n")[0];

  assertEquals(
    header,
    "10235  Ada Lovelace  2026-08-15 09:20  (edited 2026-08-15 09:22)  (degraded: table)",
  );
});

Deno.test("a comment never revised says nothing about being edited", () => {
  assertEquals(renderThread([mapComment(PLAIN)]).includes("(edited"), false);
});

Deno.test("a blank line in a body stays blank rather than indented", () => {
  const spaced = { ...PLAIN, body: paragraphs("First.", "", "Second.") };

  assertEquals(renderThread([mapComment(spaced)]).split("\n").slice(1), [
    "  First.",
    "",
    "  Second.",
  ]);
});

Deno.test("comments keep the order they were given, separated by a blank line", () => {
  const rendered = renderThread([PLAIN, TABULAR, RESTRICTED].map(mapComment));
  const ids = rendered
    .split("\n")
    .filter((line) => !line.startsWith("  ") && line.length > 0)
    .map((line) => line.split("  ")[0]);

  assertEquals(ids, ["10234", "10235", "10236"]);
  assertEquals(rendered.includes("Waiting on QA.\n\n10235"), true);
});

Deno.test("an issue with no comments says so", () => {
  assertEquals(renderThread([] as JiraComment[]), "No comments found.");
});
