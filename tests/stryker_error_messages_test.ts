import { assertEquals } from "testing/asserts.ts";
import {
  type BabelPath,
  shouldIgnore,
} from "../scripts/stryker-error-messages.ts";

function pathFromRootTo(...nodes: BabelPath["node"][]): BabelPath {
  return nodes.reduce<BabelPath | null>(
    (parentPath, node) => ({ node, parentPath }),
    null,
  ) as BabelPath;
}

const message = { type: "StringLiteral" };
const newError = (name: string) => ({
  type: "NewExpression",
  callee: { type: "Identifier", name },
});

Deno.test("a message thrown is left unmutated", () => {
  const path = pathFromRootTo(
    { type: "ThrowStatement" },
    newError("Error"),
    message,
  );

  assertEquals(
    shouldIgnore(path),
    "Error message wording is not behaviour.",
  );
});

Deno.test("an error built but not yet thrown is left unmutated too", () => {
  const path = pathFromRootTo(
    { type: "ReturnStatement" },
    newError("UnexpressibleError"),
    { type: "TemplateLiteral" },
  );

  assertEquals(
    shouldIgnore(path),
    "Error message wording is not behaviour.",
  );
});

Deno.test("a string outside any error is mutated", () => {
  const path = pathFromRootTo({ type: "ReturnStatement" }, message);

  assertEquals(shouldIgnore(path), undefined);
});

Deno.test("a condition inside a throw is mutated", () => {
  const path = pathFromRootTo({ type: "ThrowStatement" }, {
    type: "BinaryExpression",
  });

  assertEquals(shouldIgnore(path), undefined);
});

Deno.test("a new object that is not an error does not count", () => {
  const path = pathFromRootTo(
    { type: "ReturnStatement" },
    newError("Map"),
    message,
  );

  assertEquals(shouldIgnore(path), undefined);
});

Deno.test("a function boundary ends the search for a throw", () => {
  const path = pathFromRootTo(
    { type: "ThrowStatement" },
    { type: "ArrowFunctionExpression" },
    message,
  );

  assertEquals(shouldIgnore(path), undefined);
});
