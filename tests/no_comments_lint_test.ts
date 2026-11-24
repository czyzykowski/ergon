import { assertEquals } from "testing/asserts.ts";
import plugin from "../lint/no-comments.ts";

const reported = (source: string) =>
  Deno.lint.runPlugin(plugin, "/repo/src/a.ts", source).map((found) =>
    source.slice(found.range[0], found.range[1])
  );

Deno.test("line, block and doc comments are all reported", () => {
  assertEquals(
    reported(`
      // a line
      /* a block */
      /** a doc */
      const a = 1; // trailing
    `),
    ["// a line", "/* a block */", "/** a doc */", "// trailing"],
  );
});

Deno.test("comment markers inside strings and regexes are code", () => {
  assertEquals(
    reported(
      `const url = "https://x"; const re = /\\/\\//; const t = \`/* */\`;`,
    ),
    [],
  );
});

Deno.test("bare tool directives pass", () => {
  assertEquals(
    reported(`
      // deno-fmt-ignore
      // deno-fmt-ignore-file
      // deno-coverage-ignore
      // deno-coverage-ignore-start
      // deno-coverage-ignore-stop
      // deno-coverage-ignore-file
      // @ts-expect-error
      // @ts-ignore
      // @ts-nocheck
      /* @ts-expect-error */
      // @deno-types="./a.d.ts"
      /// <reference types="./a.d.ts" />
    `),
    [],
  );
});

Deno.test("lint ignores naming their rules pass", () => {
  assertEquals(
    reported(`
      // deno-lint-ignore ergon/atomic-write no-explicit-any
      // deno-lint-ignore-file no-explicit-any
      // oxlint-disable-next-line no-console, eqeqeq
      // oxlint-disable
      // oxlint-enable
    `),
    [],
  );
});

Deno.test("a directive carrying a reason is reported", () => {
  assertEquals(
    reported(`
      // deno-lint-ignore ergon/atomic-write -- a scratch file
      // @ts-expect-error the types lag the runtime
      // deno-fmt-ignore keeps the table aligned
    `),
    [
      "// deno-lint-ignore ergon/atomic-write -- a scratch file",
      "// @ts-expect-error the types lag the runtime",
      "// deno-fmt-ignore keeps the table aligned",
    ],
  );
});

Deno.test("a deno-lint-ignore that could silence this rule is reported", () => {
  assertEquals(
    reported(`
      // deno-lint-ignore
      // deno-lint-ignore ergon/no-comments
      // deno-lint-ignore-FILE ergon/no-comments
      // deno-lint-ignore-file
    `),
    [
      "// deno-lint-ignore",
      "// deno-lint-ignore ergon/no-comments",
      "// deno-lint-ignore-FILE ergon/no-comments",
      "// deno-lint-ignore-file",
    ],
  );
});

Deno.test("a doc comment is not a directive, even one naming a tool", () => {
  assertEquals(reported(`/** @ts-ignore */`), ["/** @ts-ignore */"]);
});
