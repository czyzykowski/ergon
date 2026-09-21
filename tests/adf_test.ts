import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { canReplace, renderAdf, toAdf } from "../src/adf.ts";

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

function block(...content: unknown[]) {
  return { type: "doc", version: 1, content };
}

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

// --- writing ---------------------------------------------------------------

Deno.test("toAdf makes a paragraph of each markdown paragraph", () => {
  assertEquals(toAdf("a\n\nb"), {
    type: "doc",
    version: 1,
    content: [
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "paragraph", content: [{ type: "text", text: "b" }] },
    ],
  });
});

Deno.test("toAdf turns a wrapped line into a break, which is all ADF has", () => {
  assertEquals(toAdf("a\nb").content, [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "a" },
        { type: "hardBreak" },
        { type: "text", text: "b" },
      ],
    },
  ]);
});

Deno.test("toAdf writes an empty description as an empty document", () => {
  assertEquals(toAdf(""), { type: "doc", version: 1, content: [] });
});

Deno.test("toAdf refuses a construct it cannot express, naming it", () => {
  assertThrows(
    () => toAdf("![shot](https://example.com/a.png)"),
    Error,
    "ergon cannot write an image. Jira addresses an attachment by id",
  );

  assertThrows(() => toAdf("<b>x</b>"), Error, "ergon cannot write raw HTML");
});

Deno.test("toAdf refuses a nesting ADF has no room for, saying where", () => {
  assertThrows(
    () => toAdf("- item\n\n  | a |\n  | - |\n  | 1 |"),
    Error,
    "ergon cannot write a table inside a list item. A Jira list item holds a " +
      "paragraph, a list or a code block. Move it out.",
  );

  assertThrows(
    () => toAdf("- # heading"),
    Error,
    "ergon cannot write a heading inside a list item",
  );

  assertThrows(
    () => toAdf("- > quoted"),
    Error,
    "ergon cannot write a quote inside a list item",
  );

  assertThrows(
    () => toAdf("- item\n\n  - [x] done"),
    Error,
    "ergon cannot write a task list inside a list item",
  );

  assertThrows(
    () => toAdf("> > deep"),
    Error,
    "ergon cannot write a quote inside a quote",
  );
});

Deno.test("toAdf keeps what a list item and a quote may legally hold", () => {
  assertEquals(toAdf("- one\n  - two\n    - three").content, [{
    type: "bulletList",
    content: [{
      type: "listItem",
      content: [paragraph("one"), {
        type: "bulletList",
        content: [{
          type: "listItem",
          content: [paragraph("two"), {
            type: "bulletList",
            content: [{ type: "listItem", content: [paragraph("three")] }],
          }],
        }],
      }],
    }],
  }]);

  assertEquals(toAdf("- one\n\n  ```ts\n  x\n  ```").content, [{
    type: "bulletList",
    content: [{
      type: "listItem",
      content: [
        paragraph("one"),
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "x" }],
        },
      ],
    }],
  }]);

  assertEquals(toAdf("> - one").content, [{
    type: "blockquote",
    content: [{
      type: "bulletList",
      content: [{ type: "listItem", content: [paragraph("one")] }],
    }],
  }]);
});

Deno.test("toAdf refuses a footnote and a partly ticked list", () => {
  assertThrows(
    () => toAdf("a[^1]\n\n[^1]: note"),
    Error,
    "ergon cannot write a footnote",
  );

  assertThrows(
    () => toAdf("- [x] done\n- loose"),
    Error,
    "a list that is only partly a checklist",
  );
});

Deno.test("toAdf writes a heading at the level it was written", () => {
  for (let level = 1; level <= 6; level += 1) {
    assertEquals(toAdf(`${"#".repeat(level)} Goal`).content, [{
      type: "heading",
      attrs: { level },
      content: [{ type: "text", text: "Goal" }],
    }]);
  }
});

Deno.test("toAdf writes a bullet list, nesting as it was written", () => {
  assertEquals(toAdf("- one\n- two\n  - deep").content, [{
    type: "bulletList",
    content: [
      { type: "listItem", content: [paragraph("one")] },
      {
        type: "listItem",
        content: [
          paragraph("two"),
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [paragraph("deep")] }],
          },
        ],
      },
    ],
  }]);
});

Deno.test("toAdf keeps the number an ordered list starts at", () => {
  assertEquals(toAdf("3. third\n4. fourth").content, [{
    type: "orderedList",
    attrs: { order: 3 },
    content: [
      { type: "listItem", content: [paragraph("third")] },
      { type: "listItem", content: [paragraph("fourth")] },
    ],
  }]);

  assertEquals(toAdf("1. one").content, [{
    type: "orderedList",
    attrs: { order: 1 },
    content: [{ type: "listItem", content: [paragraph("one")] }],
  }]);
});

Deno.test("toAdf writes a quote, a rule and a fenced block", () => {
  assertEquals(toAdf("> quoted").content, [{
    type: "blockquote",
    content: [paragraph("quoted")],
  }]);

  assertEquals(toAdf("---").content, [{ type: "rule" }]);

  assertEquals(toAdf("```ts\nconst a = 1;\n```").content, [{
    type: "codeBlock",
    attrs: { language: "ts" },
    content: [{ type: "text", text: "const a = 1;" }],
  }]);

  assertEquals(toAdf("```\nbare\n```").content, [{
    type: "codeBlock",
    content: [{ type: "text", text: "bare" }],
  }]);
});

Deno.test("toAdf carries a mark as a mark on the text it covers", () => {
  assertEquals(toAdf("**loud** and *soft* and `lit`").content, [{
    type: "paragraph",
    content: [
      { type: "text", text: "loud", marks: [{ type: "strong" }] },
      { type: "text", text: " and " },
      { type: "text", text: "soft", marks: [{ type: "em" }] },
      { type: "text", text: " and " },
      { type: "text", text: "lit", marks: [{ type: "code" }] },
    ],
  }]);
});

Deno.test("toAdf writes a link as a mark, keeping what nests inside it", () => {
  assertEquals(toAdf("[**here**](https://example.com)").content, [{
    type: "paragraph",
    content: [{
      type: "text",
      text: "here",
      marks: [
        { type: "link", attrs: { href: "https://example.com" } },
        { type: "strong" },
      ],
    }],
  }]);
});

Deno.test("toAdf writes a checklist as a task list, state and all", () => {
  assertEquals(toAdf("- [x] shipped\n- [ ] pending").content, [{
    type: "taskList",
    attrs: { localId: "ergon-task-1" },
    content: [
      {
        type: "taskItem",
        attrs: { state: "DONE", localId: "ergon-task-2" },
        content: [{ type: "text", text: "shipped" }],
      },
      {
        type: "taskItem",
        attrs: { state: "TODO", localId: "ergon-task-3" },
        content: [{ type: "text", text: "pending" }],
      },
    ],
  }]);
});

Deno.test("toAdf writes strikethrough as a mark", () => {
  assertEquals(toAdf("~~gone~~").content, [{
    type: "paragraph",
    content: [{ type: "text", text: "gone", marks: [{ type: "strike" }] }],
  }]);
});

Deno.test("toAdf writes a table, taking its first row as the header", () => {
  assertEquals(toAdf("| env |\n| --- |\n| prod |").content, [{
    type: "table",
    attrs: { isNumberColumnEnabled: false, layout: "default" },
    content: [
      {
        type: "tableRow",
        content: [{ type: "tableHeader", content: [paragraph("env")] }],
      },
      {
        type: "tableRow",
        content: [{ type: "tableCell", content: [paragraph("prod")] }],
      },
    ],
  }]);
});

Deno.test("toAdf refuses an alignment a Jira table cannot hold", () => {
  assertThrows(
    () => toAdf("| a |\n| :-: |\n| 1 |"),
    Error,
    "ergon cannot write a column alignment",
  );
});

Deno.test("markdown written another way means the same document", () => {
  for (
    const [written, canonical] of [
      ["_soft_", "*soft*"],
      ["__loud__", "**loud**"],
      ["+ one", "- one"],
      ["* one", "- one"],
      ["Goal\n====", "# Goal"],
      ["***", "---"],
    ]
  ) {
    assertEquals(toAdf(written), toAdf(canonical), written);
  }
});

Deno.test("a non-canonical spelling reads back canonicalised", () => {
  assertEquals(renderAdf(toAdf("_soft_")).text, "*soft*");
  assertEquals(renderAdf(toAdf("+ one")).text, "- one");
});

// --- reading ---------------------------------------------------------------

Deno.test("renderAdf separates blocks with a blank line", () => {
  assertEquals(renderAdf(block(paragraph("a"), paragraph("b"))).text, "a\n\nb");
});

Deno.test("what renderAdf emits parses back as the same paragraphs", () => {
  const doc = block(paragraph("a"), paragraph("b"));

  assertEquals(toAdf(renderAdf(doc).text).content, doc.content);
});

Deno.test("an absent and an empty description both read as no body", () => {
  assertEquals(renderAdf(undefined), { text: "", degraded: [] });
  assertEquals(renderAdf(null), { text: "", degraded: [] });
  assertEquals(renderAdf(block()), { text: "", degraded: [] });
  assertEquals(renderAdf({ type: "doc", version: 1 }), {
    text: "",
    degraded: [],
  });
});

Deno.test("renderAdf drops a paragraph with nothing in it", () => {
  const doc = block(paragraph("a"), { type: "paragraph" }, paragraph("b"));

  assertEquals(renderAdf(doc).text, "a\n\nb");
});

Deno.test("renderAdf escapes text that would read back as markdown", () => {
  for (
    const text of [
      "a * b",
      "# not a heading",
      "- not a list",
      "1. not ordered",
      "_emph_",
      "a `tick`",
      "[link](x)",
      "<b>",
      "&amp;",
      "~~struck~~",
      "back\\slash",
      "---",
    ]
  ) {
    const doc = block(paragraph(text));

    assertEquals(toAdf(renderAdf(doc).text).content, doc.content, text);
  }
});

Deno.test("renderAdf leaves an intraword underscore alone", () => {
  assertEquals(
    renderAdf(block(paragraph("snake_case_name"))).text,
    "snake_case_name",
  );
});

Deno.test("renderAdf escapes a heading that would close itself", () => {
  const doc = block({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: "Goal #" }],
  });

  assertEquals(renderAdf(doc).text, "## Goal \\#");
  assertEquals(toAdf(renderAdf(doc).text).content, doc.content);
});

Deno.test("renderAdf renders a bullet list", () => {
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

Deno.test("renderAdf indents a list item's later blocks under its bullet", () => {
  const doc = block({
    type: "bulletList",
    content: [
      { type: "listItem", content: [paragraph("first"), paragraph("second")] },
    ],
  });

  assertEquals(renderAdf(doc).text, "- first\n\n  second");
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

Deno.test("renderAdf widens the fence around code holding backticks", () => {
  const doc = block({
    type: "codeBlock",
    content: [{ type: "text", text: "``` inner ```" }],
  });

  assertEquals(renderAdf(doc).text, "````\n``` inner ```\n````");
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

  assertEquals(renderAdf(doc).text, "## Goal\n\n> quoted\n\n---");
});

Deno.test("renderAdf keeps a quote whole across its blank lines", () => {
  const doc = block({
    type: "blockquote",
    content: [paragraph("one"), paragraph("two")],
  });

  assertEquals(renderAdf(doc).text, "> one\n>\n> two");
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

Deno.test("renderAdf leaves inline code unescaped inside its fence", () => {
  const doc = block({
    type: "paragraph",
    content: [{ type: "text", text: "a*b*c", marks: [{ type: "code" }] }],
  });

  assertEquals(renderAdf(doc).text, "`a*b*c`");
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

Deno.test("renderAdf writes a table as a table, header row and all", () => {
  const doc = block({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableHeader", content: [paragraph("env")] },
          { type: "tableHeader", content: [paragraph("host")] },
        ],
      },
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [paragraph("prod")] },
          { type: "tableCell", content: [paragraph("a|b")] },
        ],
      },
    ],
  });

  assertEquals(renderAdf(doc), {
    text: "| env | host |\n| --- | --- |\n| prod | a\\|b |",
    degraded: [],
  });
});

Deno.test("renderAdf reports a table whose shape markdown cannot hold", () => {
  const headerless = block({
    type: "table",
    content: [{
      type: "tableRow",
      content: [{ type: "tableCell", content: [paragraph("env")] }],
    }],
  });

  assertEquals(renderAdf(headerless).degraded, ["table"]);

  const crowded = block({
    type: "table",
    content: [{
      type: "tableRow",
      content: [{
        type: "tableHeader",
        content: [paragraph("one"), paragraph("two")],
      }],
    }],
  });

  assertEquals(renderAdf(crowded), {
    text: "| one two |\n| --- |",
    degraded: ["table"],
  });
});

Deno.test("renderAdf strikes through what Jira struck through", () => {
  const doc = block({
    type: "paragraph",
    content: [{ type: "text", text: "gone", marks: [{ type: "strike" }] }],
  });

  assertEquals(renderAdf(doc), { text: "~~gone~~", degraded: [] });
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
    text: "@Ada see https://example.com/x\\\n:tada:",
    degraded: ["emoji", "inlineCard", "mention"],
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
    text: "inside\n\ninside",
    degraded: ["layoutColumn", "layoutSection"],
  });
});

Deno.test("what stays outside the set is read whole and reported", () => {
  const outside: Array<[string, unknown, string]> = [
    ["panel", { type: "panel", content: [paragraph("careful")] }, "> careful"],
    [
      "expand",
      { type: "expand", attrs: { title: "More" }, content: [paragraph("in")] },
      "More\n\nin",
    ],
    [
      "media",
      {
        type: "mediaSingle",
        content: [{ type: "media", attrs: { alt: "shot.png" } }],
      },
      "shot.png",
    ],
    [
      "mention",
      {
        type: "paragraph",
        content: [{ type: "mention", attrs: { text: "@Ada" } }],
      },
      "@Ada",
    ],
    [
      "emoji",
      {
        type: "paragraph",
        content: [{ type: "emoji", attrs: { shortName: ":tada:" } }],
      },
      ":tada:",
    ],
    [
      "inlineCard",
      {
        type: "paragraph",
        content: [{ type: "inlineCard", attrs: { url: "https://x.test/a" } }],
      },
      "https://x.test/a",
    ],
    [
      "date",
      {
        type: "paragraph",
        content: [{ type: "date", attrs: { timestamp: "1758412800000" } }],
      },
      "1758412800000",
    ],
    [
      "status",
      {
        type: "paragraph",
        content: [{ type: "status", attrs: { text: "BLOCKED" } }],
      },
      "BLOCKED",
    ],
  ];

  for (const [name, node, text] of outside) {
    const doc = block(node);

    assertEquals(renderAdf(doc).text, text, name);
    assertEquals(renderAdf(doc).degraded.includes(name), true, name);
    assertEquals(canReplace(doc).ok, false, name);
  }
});

Deno.test("two lists in a row take turns, so they stay two lists", () => {
  const list = (kind: string, text: string) => ({
    type: kind,
    ...(kind === "orderedList" ? { attrs: { order: 1 } } : {}),
    content: [{
      type: kind === "taskList" ? "taskItem" : "listItem",
      ...(kind === "taskList" ? { attrs: { state: "TODO" } } : {}),
      content: kind === "taskList"
        ? [{ type: "text", text }]
        : [paragraph(text)],
    }],
  });

  const doc = block(
    list("bulletList", "one"),
    list("taskList", "two"),
    list("bulletList", "three"),
    list("orderedList", "four"),
    list("orderedList", "five"),
  );

  assertEquals(
    renderAdf(doc).text,
    "- one\n\n* [ ] two\n\n- three\n\n1. four\n\n1) five",
  );
  assertEquals(canReplace(doc).ok, true);
});

Deno.test("renderAdf sorts and deduplicates what it degraded", () => {
  const doc = block(
    { type: "table", content: [] },
    { type: "panel", content: [paragraph("a")] },
    { type: "table", content: [] },
  );

  assertEquals(renderAdf(doc).degraded, ["panel", "table"]);
});

// --- the round trip, contained ---------------------------------------------

Deno.test("canReplace opens a document of paragraphs", () => {
  assertEquals(canReplace(block(paragraph("a"), paragraph("b"))), {
    ok: true,
    differences: [],
  });
});

Deno.test("canReplace treats an absent document as replaceable", () => {
  assertEquals(canReplace(undefined), { ok: true, differences: [] });
});

Deno.test("canReplace refuses what ergon cannot write back, naming it", () => {
  const doc = block({
    type: "panel",
    attrs: { panelType: "warning" },
    content: [paragraph("careful")],
  });

  assertEquals(canReplace(doc), {
    ok: false,
    differences: ["a panel (ergon would write it back as a quote)"],
  });
});

Deno.test("canReplace opens what ergon can now write back", () => {
  assertEquals(canReplace(BULLETED).ok, true);
  assertEquals(canReplace(BOLD).ok, true);
});

Deno.test("canReplace ignores a localId, which Jira mints", () => {
  const doc = block({
    type: "paragraph",
    attrs: { localId: "abc-123" },
    content: [{ type: "text", text: "a" }],
  });

  assertEquals(canReplace(doc).ok, true);
});

Deno.test("canReplace coalesces a run of text Jira split up", () => {
  const doc = block({
    type: "paragraph",
    content: [
      { type: "text", text: "on", marks: [{ type: "strong" }] },
      { type: "text", text: "e", marks: [{ type: "strong" }] },
    ],
  });

  assertEquals(canReplace(doc).ok, true);
});

Deno.test("canReplace compares marks without regard to order", () => {
  const doc = block({
    type: "paragraph",
    content: [{
      type: "text",
      text: "x",
      marks: [{ type: "strong" }, { type: "link", attrs: { href: "u" } }],
    }],
  });

  assertEquals(canReplace(doc).ok, true);
});

Deno.test("canReplace refuses an attribute ergon would not have written", () => {
  const doc = block({
    type: "paragraph",
    content: [{ type: "text", text: "a" }],
    attrs: { panelType: "note" },
  });

  assertEquals(canReplace(doc).differences, ["a paragraph's kind"]);
});

// --- the property ----------------------------------------------------------

/**
 * The generator draws only from the Expressible set, so every document it
 * produces is one `ergon edit` must open. That is what stops a fail-closed
 * guard from becoming a guard that refuses everything.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Fragments chosen to sit on markdown's punctuation, not to read well. */
const PHRASES = [
  "plain words",
  "a * b",
  "# not a heading",
  "- not a list",
  "1. not ordered",
  "snake_case_name",
  "_emph_",
  "a `tick`",
  "[link](x)",
  "<b>",
  "&amp;",
  "~~struck~~",
  "a|b",
  "---",
  "===",
  "> quoted",
  "back\\slash",
  "100% done",
  "x (y)",
  "café ünïcode",
];

interface Generator {
  next: () => number;
}

function pick<T>(gen: Generator, values: T[]): T {
  return values[Math.floor(gen.next() * values.length)];
}

function times<T>(
  gen: Generator,
  max: number,
  make: (index: number) => T,
): T[] {
  return Array.from(
    { length: 1 + Math.floor(gen.next() * max) },
    (_value, index) => make(index),
  );
}

const MARK_SETS = [
  [],
  [{ type: "strong" }],
  [{ type: "em" }],
  [{ type: "code" }],
  [{ type: "strong" }, { type: "em" }],
  [{ type: "link", attrs: { href: "https://example.test/a" } }],
  [
    { type: "link", attrs: { href: "https://example.test/a" } },
    { type: "strong" },
  ],
  [
    { type: "strong" },
    { type: "link", attrs: { href: "https://example.test/a" } },
  ],
];

const LANGUAGES = [undefined, "ts", "json"];
const SOURCE = ["const a = 1;", "``` inner ```", "x\ny", "- not a list"];

/**
 * Emphasis delimiters have to flank a word: markdown cannot emphasise a run
 * that begins or ends in punctuation when what sits beside it is a letter, so
 * such a run is not Expressible and the generator does not draw one.
 */
const FLANKABLE = PHRASES.filter((phrase) =>
  /^[\p{L}\p{N}]/u.test(phrase) && /[\p{L}\p{N}]$/u.test(phrase)
);

function wraps(marks: Array<{ type: string }>): boolean {
  return marks.some((mark) =>
    mark.type === "strong" || mark.type === "em" || mark.type === "strike"
  );
}

/**
 * Two emphasised runs written side by side share a delimiter run, which reads
 * back as something else — `***a****b*` is not two runs to any parser. So an
 * emphasised run always has something unemphasised beside it, which is another
 * arrangement markdown cannot spell.
 */
function generateText(gen: Generator): unknown[] {
  let adjacent = false;

  return times(gen, 3, () => {
    const marks = pick(
      gen,
      adjacent ? MARK_SETS.filter((set) => !wraps(set)) : MARK_SETS,
    );
    adjacent = wraps(marks);

    return {
      type: "text",
      text: pick(gen, adjacent ? FLANKABLE : PHRASES),
      ...(marks.length > 0 ? { marks } : {}),
    };
  });
}

/** Paragraphs are the only block whose text may wrap, so breaks live here. */
function generateParagraph(gen: Generator): unknown {
  const lines = times(gen, 2, () => generateText(gen));

  return {
    type: "paragraph",
    content: lines.flatMap((line, index) =>
      index === 0 ? line : [{ type: "hardBreak" }, ...line]
    ),
  };
}

function generateListItem(gen: Generator, depth: number): unknown {
  return {
    type: "listItem",
    content: [
      generateParagraph(gen),
      ...(depth > 0 && gen.next() < 0.3
        ? [generateList(gen, depth - 1, gen.next() < 0.5)]
        : []),
    ],
  };
}

function generateList(
  gen: Generator,
  depth: number,
  ordered: boolean,
): Record<string, unknown> {
  return {
    type: ordered ? "orderedList" : "bulletList",
    ...(ordered ? { attrs: { order: 1 + Math.floor(gen.next() * 4) } } : {}),
    content: times(gen, 2, () => generateListItem(gen, depth)),
  };
}

function generateBlock(gen: Generator, depth: number): Record<string, unknown> {
  const language = pick(gen, LANGUAGES);

  switch (
    pick(gen, [
      "paragraph",
      "heading",
      "list",
      "quote",
      "rule",
      "code",
      "tasks",
      "table",
    ])
  ) {
    case "heading":
      return {
        type: "heading",
        attrs: { level: 1 + Math.floor(gen.next() * 6) },
        content: generateText(gen),
      };

    case "list":
      return generateList(gen, depth, gen.next() < 0.5);

    case "quote":
      return {
        type: "blockquote",
        content: times(gen, 2, () => generateParagraph(gen)),
      };

    case "rule":
      return { type: "rule" };

    case "tasks":
      return {
        type: "taskList",
        attrs: { localId: "jira-minted" },
        content: times(gen, 2, (index) => ({
          type: "taskItem",
          attrs: {
            localId: `jira-minted-${index}`,
            state: gen.next() < 0.5 ? "DONE" : "TODO",
          },
          content: generateText(gen),
        })),
      };

    case "table":
      return generateTable(gen);

    case "code":
      return {
        type: "codeBlock",
        ...(language ? { attrs: { language } } : {}),
        content: [{ type: "text", text: pick(gen, SOURCE) }],
      };

    default:
      return generateParagraph(gen) as Record<string, unknown>;
  }
}

/** Every row is as wide as the header, since that is the only shape GFM has. */
function generateTable(gen: Generator): Record<string, unknown> {
  const width = 1 + Math.floor(gen.next() * 3);
  const row = (kind: string) => ({
    type: "tableRow",
    content: Array.from({ length: width }, () => ({
      type: kind,
      content: [{ type: "paragraph", content: generateText(gen) }],
    })),
  });

  return {
    type: "table",
    content: [row("tableHeader"), ...times(gen, 2, () => row("tableCell"))],
  };
}

function generateDoc(gen: Generator): Record<string, unknown> {
  return {
    type: "doc",
    version: 1,
    content: times(gen, 5, () => generateBlock(gen, 2)),
  };
}

Deno.test("rendering a document and parsing it back yields the document", () => {
  const gen = { next: seeded(20260921) };

  for (let run = 0; run < 2000; run += 1) {
    const doc = generateDoc(gen);
    const verdict = canReplace(doc);

    assertEquals(
      verdict.differences,
      [],
      `${JSON.stringify(doc)}\n rendered to ${
        JSON.stringify(renderAdf(doc).text)
      }`,
    );
  }
});
