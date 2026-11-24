// A Stryker ignorer: leaves the wording of error messages unmutated. The
// error ergon throws is behaviour a test should pin; the sentence it carries
// is free to change, and a test that asserts every word of it would break on
// each rewording without catching a bug. Only the message literals are
// skipped: a condition or call inside the `throw` is still mutated.
//
// Loaded by `stryker.config.json` (`appendPlugins`, `ignorers`).

import { declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";

/** The parts of a Babel NodePath this ignorer reads. */
export interface Path {
  node: { type: string; callee?: { type: string; name?: string } };
  parentPath: Path | null;
}

const MESSAGES = new Set(["StringLiteral", "TemplateLiteral"]);
const FUNCTIONS = new Set([
  "ArrowFunctionExpression",
  "ClassMethod",
  "FunctionDeclaration",
  "FunctionExpression",
  "ObjectMethod",
]);

/** `new SomethingError(...)`: an error being built, thrown or not. */
function buildsError(node: Path["node"]): boolean {
  return node.type === "NewExpression" &&
    node.callee?.type === "Identifier" &&
    (node.callee.name?.endsWith("Error") ?? false);
}

/** Why `path` is left alone, or undefined to mutate it. */
export function shouldIgnore(path: Path): string | undefined {
  if (!MESSAGES.has(path.node.type)) return undefined;

  for (let at = path.parentPath; at; at = at.parentPath) {
    if (FUNCTIONS.has(at.node.type)) return undefined;
    if (at.node.type === "ThrowStatement" || buildsError(at.node)) {
      return "Error message wording is not behaviour.";
    }
  }
  return undefined;
}

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, "error-messages", {
    shouldIgnore: (path: unknown) => shouldIgnore(path as Path),
  }),
];
