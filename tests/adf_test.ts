import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { fromAdf, renderAdf, toAdf, unsupportedAdfNodes } from "../src/adf.ts";

const BULLETED = {
  type: "doc",
  version: 1,
  content: [
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "one" }] },
          ],
        },
      ],
    },
  ],
};

const BOLD = {
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "loud", marks: [{ type: "strong" }] },
      ],
    },
  ],
};

Deno.test("toAdf renders each line as a paragraph", () => {
  assertEquals(toAdf("a\nb"), {
    type: "doc",
    version: 1,
    content: [
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "paragraph", content: [{ type: "text", text: "b" }] },
    ],
  });
});

Deno.test("toAdf renders a blank line as an empty paragraph", () => {
  assertEquals(toAdf("a\n\nb").content, [
    { type: "paragraph", content: [{ type: "text", text: "a" }] },
    { type: "paragraph", content: [] },
    { type: "paragraph", content: [{ type: "text", text: "b" }] },
  ]);
});

Deno.test("fromAdf inverts toAdf", () => {
  for (const text of ["one line", "a\nb", "a\n\nb", "", "trailing\n"]) {
    assertEquals(fromAdf(toAdf(text)), text);
  }
});

Deno.test("fromAdf treats an absent description as empty", () => {
  assertEquals(fromAdf(undefined), "");
  assertEquals(fromAdf(null), "");
});

Deno.test("fromAdf joins the text nodes within a paragraph", () => {
  assertEquals(fromAdf(BOLD), "loud");
});

Deno.test("unsupportedAdfNodes passes what toAdf can produce", () => {
  assertEquals(unsupportedAdfNodes(toAdf("a\n\nb")), []);
  assertEquals(unsupportedAdfNodes(undefined), []);
  assertEquals(unsupportedAdfNodes(null), []);
});

Deno.test("unsupportedAdfNodes reports nested rich nodes", () => {
  assertEquals(unsupportedAdfNodes(BULLETED), ["bulletList", "listItem"]);
});

Deno.test("unsupportedAdfNodes reports marks, which carry no node type", () => {
  assertEquals(unsupportedAdfNodes(BOLD), ["strong"]);
});

Deno.test("unsupportedAdfNodes deduplicates and sorts", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "table" },
      { type: "codeBlock" },
      { type: "table" },
    ],
  };

  assertEquals(unsupportedAdfNodes(doc), ["codeBlock", "table"]);
});

function block(...content: unknown[]) {
  return { type: "doc", version: 1, content };
}

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

Deno.test("renderAdf agrees with fromAdf on plain paragraphs", () => {
  for (const text of ["one line", "a\nb", "a\n\nb", "", "trailing\n"]) {
    assertEquals(renderAdf(toAdf(text)), { text, degraded: [] });
  }
});

Deno.test("renderAdf treats an absent description as empty", () => {
  assertEquals(renderAdf(undefined), { text: "", degraded: [] });
  assertEquals(renderAdf(null), { text: "", degraded: [] });
});

Deno.test("renderAdf renders a bullet list fromAdf would blank out", () => {
  assertEquals(fromAdf(BULLETED), "");
  assertEquals(renderAdf(BULLETED), { text: "- one", degraded: [] });
});

Deno.test("renderAdf numbers an ordered list from its start", () => {
  const doc = block({
    type: "orderedList",
    attrs: { order: 3 },
    content: [
      { type: "listItem", content: [paragraph("third")] },
      { type: "listItem", content: [paragraph("fourth")] },
    ],
  });

  assertEquals(renderAdf(doc).text, "3. third\n4. fourth");
});

Deno.test("renderAdf indents a list item's later lines under its bullet", () => {
  const doc = block({
    type: "bulletList",
    content: [
      { type: "listItem", content: [paragraph("first"), paragraph("second")] },
    ],
  });

  assertEquals(renderAdf(doc).text, "- first\n  second");
});

Deno.test("renderAdf renders task items with their state", () => {
  const doc = block({
    type: "taskList",
    content: [
      {
        type: "taskItem",
        attrs: { state: "DONE" },
        content: [{ type: "text", text: "shipped" }],
      },
      {
        type: "taskItem",
        attrs: { state: "TODO" },
        content: [{ type: "text", text: "pending" }],
      },
    ],
  });

  assertEquals(renderAdf(doc).text, "- [x] shipped\n- [ ] pending");
});

Deno.test("renderAdf fences a code block with its language", () => {
  const doc = block({
    type: "codeBlock",
    attrs: { language: "ts" },
    content: [{ type: "text", text: "const a = 1;" }],
  });

  assertEquals(renderAdf(doc).text, "```ts\nconst a = 1;\n```");
});

Deno.test("renderAdf renders headings, quotes and rules", () => {
  const doc = block(
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Goal" }],
    },
    { type: "blockquote", content: [paragraph("quoted")] },
    { type: "rule" },
  );

  assertEquals(renderAdf(doc).text, "## Goal\n> quoted\n---");
});

Deno.test("renderAdf carries the marks markdown has", () => {
  assertEquals(renderAdf(BOLD), { text: "**loud**", degraded: [] });

  const doc = block({
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "docs",
        marks: [{ type: "link", attrs: { href: "https://example.com" } }],
      },
      { type: "text", text: "x", marks: [{ type: "code" }] },
    ],
  });

  assertEquals(renderAdf(doc).text, "[docs](https://example.com)`x`");
});

Deno.test("renderAdf nests a mark inside its link", () => {
  const doc = block({
    type: "paragraph",
    content: [{
      type: "text",
      text: "here",
      marks: [{ type: "strong" }, { type: "link", attrs: { href: "u" } }],
    }],
  });

  assertEquals(renderAdf(doc).text, "[**here**](u)");
});

Deno.test("renderAdf reports a mark it cannot carry, keeping the text", () => {
  const doc = block({
    type: "paragraph",
    content: [{
      type: "text",
      text: "note",
      marks: [{ type: "underline" }],
    }],
  });

  assertEquals(renderAdf(doc), { text: "note", degraded: ["underline"] });
});

Deno.test("renderAdf keeps a table's cells and reports the lost grid", () => {
  const doc = block({
    type: "table",
    content: [{
      type: "tableRow",
      content: [
        { type: "tableHeader", content: [paragraph("env")] },
        { type: "tableCell", content: [paragraph("prod")] },
      ],
    }],
  });

  assertEquals(renderAdf(doc), { text: "env | prod", degraded: ["table"] });
});

Deno.test("renderAdf keeps a panel's text and reports the panel", () => {
  const doc = block({
    type: "panel",
    attrs: { panelType: "warning" },
    content: [paragraph("careful")],
  });

  assertEquals(renderAdf(doc), { text: "> careful", degraded: ["panel"] });
});

Deno.test("renderAdf names an attachment it cannot show", () => {
  const doc = block({
    type: "mediaSingle",
    content: [{
      type: "media",
      attrs: { id: "abc", type: "file", alt: "screenshot.png" },
    }],
  });

  assertEquals(renderAdf(doc), {
    text: "screenshot.png",
    degraded: ["media"],
  });
});

Deno.test("renderAdf renders inline nodes that carry their own text", () => {
  const doc = block({
    type: "paragraph",
    content: [
      { type: "mention", attrs: { id: "1", text: "@Ada" } },
      { type: "text", text: " see " },
      { type: "inlineCard", attrs: { url: "https://example.com/x" } },
      { type: "hardBreak" },
      { type: "emoji", attrs: { shortName: ":tada:" } },
    ],
  });

  assertEquals(renderAdf(doc), {
    text: "@Ada see https://example.com/x\n:tada:",
    degraded: [],
  });
});

Deno.test("renderAdf falls back to an unknown node's own text", () => {
  const doc = block({
    type: "paragraph",
    content: [{ type: "status", attrs: { text: "BLOCKED" } }],
  });

  assertEquals(renderAdf(doc), { text: "BLOCKED", degraded: ["status"] });
});

Deno.test("renderAdf recurses into an unknown block, reporting it once", () => {
  const doc = block({
    type: "layoutSection",
    content: [{
      type: "layoutColumn",
      content: [paragraph("inside"), paragraph("inside")],
    }],
  });

  assertEquals(renderAdf(doc), {
    text: "inside\ninside",
    degraded: ["layoutColumn", "layoutSection"],
  });
});

Deno.test("renderAdf sorts and deduplicates what it degraded", () => {
  const doc = block(
    { type: "table", content: [] },
    { type: "panel", content: [paragraph("a")] },
    { type: "table", content: [] },
  );

  assertEquals(renderAdf(doc).degraded, ["panel", "table"]);
});

Deno.test("a bullet list renders clean but is still not round-trippable", () => {
  assertEquals(renderAdf(BULLETED).degraded, []);
  assertEquals(unsupportedAdfNodes(BULLETED), ["bulletList", "listItem"]);
});
