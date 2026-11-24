// `ergon/atomic-write`: under src/, a Deno.writeFile or Deno.writeTextFile
// must write a temp path that the same function then renames into place, so
// a crash mid-write never leaves a half-written state or download behind.
// A write that needs no atomicity (a scratch file) says why in a
// `// deno-lint-ignore ergon/atomic-write` comment.

type Node = Deno.lint.Node;

const WRITES = new Set([
  "writeFile",
  "writeFileSync",
  "writeTextFile",
  "writeTextFileSync",
]);
const RENAMES = new Set(["rename", "renameSync"]);
const FUNCTIONS = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);

/** `name` for a call of `Deno.name(...)`, else undefined. */
function denoMethod(call: Deno.lint.CallExpression): string | undefined {
  const { callee } = call;
  if (
    callee.type === "MemberExpression" && !callee.computed &&
    callee.object.type === "Identifier" && callee.object.name === "Deno" &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return undefined;
}

/** The innermost function around `node`, or undefined at module level. */
function enclosingFunction(node: Node): Node | undefined {
  let current = "parent" in node ? node.parent as Node : undefined;
  while (current && !FUNCTIONS.has(current.type)) {
    current = "parent" in current ? current.parent as Node : undefined;
  }
  return current;
}

/** The variable a call's first argument names, if it is a plain variable. */
function pathVariable(call: Deno.lint.CallExpression): string | undefined {
  const [first] = call.arguments;
  return first?.type === "Identifier" ? first.name : undefined;
}

const atomicWrite: Deno.lint.Rule = {
  create(context) {
    if (!context.filename.includes("/src/")) return {};

    const writes: Array<{ call: Deno.lint.CallExpression; scope?: Node }> = [];
    const renamed = new Map<Node | undefined, Set<string>>();

    return {
      CallExpression(call) {
        const method = denoMethod(call);
        if (method === undefined) return;

        const scope = enclosingFunction(call);
        if (WRITES.has(method)) {
          writes.push({ call, scope });
        } else if (RENAMES.has(method)) {
          const from = pathVariable(call);
          if (from === undefined) return;
          const names = renamed.get(scope) ?? new Set();
          renamed.set(scope, names.add(from));
        }
      },

      "Program:exit"() {
        for (const { call, scope } of writes) {
          const path = pathVariable(call);
          if (path !== undefined && renamed.get(scope)?.has(path)) continue;
          context.report({
            node: call,
            message:
              "Write to a temp path and Deno.rename it into place, in the same function.",
            hint:
              "A crash mid-write would otherwise leave a half-written file. " +
              "For a scratch file, add `// deno-lint-ignore ergon/atomic-write` " +
              "with the reason.",
          });
        }
      },
    };
  },
};

const plugin: Deno.lint.Plugin = {
  name: "ergon",
  rules: { "atomic-write": atomicWrite },
};

export default plugin;
