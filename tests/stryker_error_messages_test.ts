import { assertEquals } from "testing/asserts.ts";
import { type Path, shouldIgnore } from "../scripts/stryker-error-messages.ts";

/** A path from the root down to its last node, as Babel links it. */
function pathOf(...nodes: Path["node"][]): Path {
  return nodes.reduce<Path | null>(
    (parentPath, node) => ({ node, parentPath }),
    null,
  ) as Path;
}

const message = { type: "StringLiteral" };
const newError = (name: string) => ({
  type: "NewExpression",
  callee: { type: "Identifier", name },
});

Deno.test("a message thrown is left unmutated", () => {
  const path = pathOf({ type: "ThrowStatement" }, newError("Error"), message);

  assertEquals(
    shouldIgnore(path),
    "Error message wording is not behaviour.",
  );
});

Deno.test("an error built but not yet thrown is left unmutated too", () => {
  const path = pathOf(
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
  const path = pathOf({ type: "ReturnStatement" }, message);

  assertEquals(shouldIgnore(path), undefined);
});

Deno.test("a condition inside a throw is mutated", () => {
  const path = pathOf({ type: "ThrowStatement" }, {
    type: "BinaryExpression",
  });

  assertEquals(shouldIgnore(path), undefined);
});

Deno.test("a new object that is not an error does not count", () => {
  const path = pathOf({ type: "ReturnStatement" }, newError("Map"), message);

  assertEquals(shouldIgnore(path), undefined);
});

Deno.test("a function boundary ends the search for a throw", () => {
  const path = pathOf(
    { type: "ThrowStatement" },
    { type: "ArrowFunctionExpression" },
    message,
  );

  assertEquals(shouldIgnore(path), undefined);
});
