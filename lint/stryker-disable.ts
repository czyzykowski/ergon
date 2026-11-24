// `mutation/disable-reason`: a `// Stryker disable` comment names the
// mutators it disables, never `all`, and says why after a colon:
//
//   // Stryker disable next-line ConditionalExpression: only a shortcut; the
//   // loop below gives the same answer without it.
//
// A disable is the way past a mutant no test can kill, and the pre-push hook
// fails on every survivor, so an unexplained or blanket disable would be the
// cheapest way to make the hook pass.

const DISABLE =
  /^\s*Stryker\s+disable\b\s*(?:next-line\b\s*)?([^:]*?)\s*(?::(.*))?$/s;

/** What is wrong with a comment's text, or undefined when nothing is. */
function problemWith(comment: string): string | undefined {
  const disable = DISABLE.exec(comment);
  if (!disable) return undefined;

  const [, mutators = "", reason = ""] = disable;
  const names = mutators.split(",").map((name) => name.trim());

  if (names.includes("all") || names.every((name) => name === "")) {
    return "Name the mutators a Stryker disable covers, not `all`.";
  }
  if (reason.trim() === "") {
    return "Say why the mutant cannot be killed, after a colon.";
  }
  return undefined;
}

const disableReason: Deno.lint.Rule = {
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const message = problemWith(comment.value);
          if (message === undefined) continue;
          context.report({
            range: comment.range,
            message,
            hint: "`// Stryker disable next-line <Mutator>: <why no test " +
              "can tell the mutant from the original>`",
          });
        }
      },
    };
  },
};

const plugin: Deno.lint.Plugin = {
  name: "mutation",
  rules: { "disable-reason": disableReason },
};

export default plugin;
