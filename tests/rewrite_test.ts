import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { assertRewritable } from "../src/rewrite.ts";

const PLAIN = {
  type: "doc",
  version: 1,
  content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
};

const RICH = {
  type: "doc",
  version: 1,
  content: [
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: "one" }],
          }],
        },
      ],
    },
  ],
};

function guard(doc: unknown, supplied: boolean, force: boolean) {
  return {
    subject: "PCK-12's description",
    doc,
    supplied,
    force,
    flag: "--description",
  };
}

Deno.test("a document of paragraphs is rewritable either way", () => {
  assertEquals(assertRewritable(guard(PLAIN, false, false)), undefined);
  assertEquals(assertRewritable(guard(PLAIN, true, false)), undefined);
});

Deno.test("the editor path is refused outright, pointing at the flag", () => {
  assertThrows(
    () => assertRewritable(guard(RICH, false, false)),
    Error,
    "PCK-12's description contains bulletList, listItem, which ergon cannot " +
      "edit in place. Pass --description --force to replace it outright, or " +
      "edit it in Jira.",
  );
});

Deno.test("a replacement written by hand is refused until forced", () => {
  assertThrows(
    () => assertRewritable(guard(RICH, true, false)),
    Error,
    "PCK-12's description contains bulletList, listItem, which would be " +
      "lost. Pass --force to replace it with plain text.",
  );

  assertEquals(assertRewritable(guard(RICH, true, true)), undefined);
});

Deno.test("--force does not waive the refusal on the editor path", () => {
  assertThrows(
    () => assertRewritable(guard(RICH, false, true)),
    Error,
    "which ergon cannot edit in place",
  );
});
