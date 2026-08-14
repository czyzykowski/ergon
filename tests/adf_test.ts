import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { fromAdf, toAdf, unsupportedAdfNodes } from "../src/adf.ts";

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
