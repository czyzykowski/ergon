const ADR = "docs/adr/0017-code-carries-no-comments.md";

const THIS_RULE = "ergon/no-comments";

const BARE_DIRECTIVE = new RegExp(
  "^(?:" + [
    "deno-fmt-ignore(?:-file)?",
    "deno-coverage-ignore(?:-start|-stop|-file)?",
    "@ts-(?:expect-error|ignore|nocheck)",
    '@deno-types="[^"]*"',
    "/\\s*<reference\\s[^>]*/>",
  ].join("|") + ")$",
  "i",
);

const RULE_LIST_DIRECTIVE =
  /^(deno-lint-ignore(?:-file)?|oxlint-(?:disable|enable)(?:-next-line|-line)?)((?:[\s,]+[a-z@][\w@/-]*)*)$/i;

const DENO_LINT_IGNORE = /^deno-lint-ignore/i;

const COMMENT =
  `Comments are banned in TypeScript: make the code say it, or move it out (${ADR}).`;
const DIRECTIVE_WITH_PROSE =
  `A tool directive takes no reason; put the reason in the code, a test name or an ADR (${ADR}).`;
const UNNAMED_OR_SELF_IGNORE =
  `A deno-lint-ignore must name the rules it ignores, and ${THIS_RULE} cannot be one of them.`;

const DIRECTIVE_PREFIX = /^(?:deno-|oxlint-|@ts-|@deno-types)/i;

function objection(
  comment: Deno.lint.LineComment | Deno.lint.BlockComment,
): string | undefined {
  const text = comment.value.trim();
  if (BARE_DIRECTIVE.test(text)) return undefined;

  const directive = RULE_LIST_DIRECTIVE.exec(text);
  if (directive === null) {
    return DIRECTIVE_PREFIX.test(text) ? DIRECTIVE_WITH_PROSE : COMMENT;
  }

  const [, name = "", list = ""] = directive;
  const rules = list.split(/[\s,]+/).filter(Boolean);
  const silencesThisRule = rules.length === 0 || rules.includes(THIS_RULE);
  return DENO_LINT_IGNORE.test(name) && silencesThisRule
    ? UNNAMED_OR_SELF_IGNORE
    : undefined;
}

const noComments: Deno.lint.Rule = {
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const message = objection(comment);
          if (message !== undefined) {
            context.report({ range: comment.range, message });
          }
        }
      },
    };
  },
};

const plugin: Deno.lint.Plugin = {
  name: "ergon",
  rules: { "no-comments": noComments },
};

export default plugin;
