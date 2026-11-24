import { assertEquals } from "testing/asserts.ts";
import plugin from "../lint/stryker-disable.ts";

const lint = (source: string) =>
  Deno.lint.runPlugin(plugin, "/repo/src/adf.ts", source).map((found) =>
    found.message
  );

Deno.test("a disable naming its mutator and why passes", () => {
  assertEquals(
    lint(`
      // Stryker disable next-line ConditionalExpression: a shortcut only.
      if (children.length === 0) return node;
    `),
    [],
  );
});

Deno.test("a disable of several named mutators with a reason passes", () => {
  assertEquals(
    lint(`
      /* Stryker disable StringLiteral, BooleanLiteral: defaults Jira ignores */
      const x = 1;
    `),
    [],
  );
});

Deno.test("a disable of all is reported", () => {
  assertEquals(
    lint(`
      // Stryker disable next-line all: too hard to test.
      const x = 1;
    `),
    ["Name the mutators a Stryker disable covers, not `all`."],
  );
});

Deno.test("a disable naming no mutator is reported", () => {
  assertEquals(
    lint(`
      // Stryker disable next-line: no idea.
      const x = 1;
    `),
    ["Name the mutators a Stryker disable covers, not `all`."],
  );
});

Deno.test("a disable without a reason is reported", () => {
  assertEquals(
    lint(`
      // Stryker disable next-line ConditionalExpression
      const x = 1;
      // Stryker disable next-line ConditionalExpression:
      const y = 2;
    `),
    [
      "Say why the mutant cannot be killed, after a colon.",
      "Say why the mutant cannot be killed, after a colon.",
    ],
  );
});

Deno.test("a restore and an ordinary comment pass", () => {
  assertEquals(
    lint(`
      // Stryker restore all
      // Stryker is a mutation testing tool.
      const x = 1;
    `),
    [],
  );
});
