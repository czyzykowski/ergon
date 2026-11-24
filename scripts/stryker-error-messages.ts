import { declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";

export interface BabelPath {
  node: { type: string; callee?: { type: string; name?: string } };
  parentPath: BabelPath | null;
}

const MESSAGE_LITERALS = new Set(["StringLiteral", "TemplateLiteral"]);
const FUNCTION_BOUNDARIES = new Set([
  "ArrowFunctionExpression",
  "ClassMethod",
  "FunctionDeclaration",
  "FunctionExpression",
  "ObjectMethod",
]);

function constructsAnError(node: BabelPath["node"]): boolean {
  return node.type === "NewExpression" &&
    node.callee?.type === "Identifier" &&
    (node.callee.name?.endsWith("Error") ?? false);
}

export function shouldIgnore(path: BabelPath): string | undefined {
  if (!MESSAGE_LITERALS.has(path.node.type)) return undefined;

  for (let at = path.parentPath; at; at = at.parentPath) {
    if (FUNCTION_BOUNDARIES.has(at.node.type)) return undefined;
    if (at.node.type === "ThrowStatement" || constructsAnError(at.node)) {
      return "Error message wording is not behaviour.";
    }
  }
  return undefined;
}

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, "error-messages", {
    shouldIgnore: (path: unknown) => shouldIgnore(path as BabelPath),
  }),
];
