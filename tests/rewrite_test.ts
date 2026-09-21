import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { assertRewritable } from "../src/rewrite.ts";

function doc(...content: unknown[]) {
  return { type: "doc", version: 1, content };
}

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function cell(kind: string, text: string, attrs?: Record<string, unknown>) {
  return {
    type: kind,
    ...(attrs ? { attrs } : {}),
    content: [paragraph(text)],
  };
}

const PLAIN = doc(paragraph("hi"));

const LISTED = doc({
  type: "bulletList",
  content: [{ type: "listItem", content: [paragraph("one")] }],
});

const PANELLED = doc({
  type: "panel",
  attrs: { panelType: "warning" },
  content: [paragraph("careful")],
});

function guard(held: unknown, supplied: boolean, force: boolean) {
  return {
    subject: "PCK-12's description",
    doc: held,
    supplied,
    force,
    flag: "--description",
  };
}

Deno.test("a document ergon can write back is rewritable either way", () => {
  assertEquals(assertRewritable(guard(PLAIN, false, false)), undefined);
  assertEquals(assertRewritable(guard(PLAIN, true, false)), undefined);
});

Deno.test("what the old node-type guard refused is now opened", () => {
  for (
    const rich of [
      LISTED,
      doc({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Goal" }],
      }),
      doc({
        type: "codeBlock",
        attrs: { language: "ts" },
        content: [{ type: "text", text: "const a = 1;" }],
      }),
      doc({
        type: "taskList",
        attrs: { localId: "jira-minted" },
        content: [{
          type: "taskItem",
          attrs: { localId: "jira-minted-1", state: "DONE" },
          content: [{ type: "text", text: "shipped" }],
        }],
      }),
      doc({
        type: "paragraph",
        content: [{ type: "text", text: "loud", marks: [{ type: "strong" }] }],
      }),
    ]
  ) {
    assertEquals(assertRewritable(guard(rich, false, false)), undefined);
  }
});

Deno.test("a table ergon can reproduce is opened", () => {
  const table = doc({
    type: "table",
    // The attributes Jira writes out where its schema has a default hold
    // nothing, so they are not content to lose.
    attrs: { isNumberColumnEnabled: false, layout: "default", width: null },
    content: [
      {
        type: "tableRow",
        content: [cell("tableHeader", "env", {
          colwidth: null,
          background: null,
        })],
      },
      { type: "tableRow", content: [cell("tableCell", "prod")] },
    ],
  });

  assertEquals(assertRewritable(guard(table, false, false)), undefined);
});

Deno.test("a table laid out some other way is still refused", () => {
  const wide = doc({
    type: "table",
    attrs: { isNumberColumnEnabled: true, layout: "wide" },
    content: [{ type: "tableRow", content: [cell("tableHeader", "env")] }],
  });

  assertThrows(
    () => assertRewritable(guard(wide, false, false)),
    Error,
    "a table's `isNumberColumnEnabled`, a table's `layout`",
  );
});

Deno.test("a merged cell is refused, which a type check would have missed", () => {
  const merged = doc({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [cell("tableHeader", "env", { colspan: 2 })],
      },
      { type: "tableRow", content: [cell("tableCell", "prod")] },
    ],
  });

  assertThrows(
    () => assertRewritable(guard(merged, false, false)),
    Error,
    "PCK-12's description contains a table header cell's merged columns",
  );
});

Deno.test("the editor path is refused outright, pointing at the flag", () => {
  assertThrows(
    () => assertRewritable(guard(PANELLED, false, false)),
    Error,
    "PCK-12's description contains a panel (ergon would write it back as a " +
      "quote), which ergon cannot edit in place. Pass --description --force " +
      "to replace it outright, or edit it in Jira.",
  );
});

Deno.test("a replacement written by hand is refused until forced", () => {
  assertThrows(
    () => assertRewritable(guard(PANELLED, true, false)),
    Error,
    "which would be lost. Pass --force to replace it anyway.",
  );

  assertEquals(assertRewritable(guard(PANELLED, true, true)), undefined);
});

Deno.test("--force does not waive the refusal on the editor path", () => {
  assertThrows(
    () => assertRewritable(guard(PANELLED, false, true)),
    Error,
    "which ergon cannot edit in place",
  );
});

Deno.test("an absent description is rewritable", () => {
  assertEquals(assertRewritable(guard(undefined, false, false)), undefined);
});
