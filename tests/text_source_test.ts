import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { toAdf } from "../src/adf.ts";
import {
  assertExpressible,
  omitIfBlank,
  planSource,
  readSource,
  refuseBlank,
  type SourceFlags,
} from "../src/text_source.ts";

function flags(overrides: Partial<SourceFlags> = {}): SourceFlags {
  return {
    flag: "--description",
    fileFlag: "--description-file",
    subject: "Description",
    ...overrides,
  };
}

Deno.test("planSource settles the Source an invocation names", () => {
  assertEquals(planSource(flags({ inline: "Just this." })), {
    kind: "inline",
    text: "Just this.",
  });
  assertEquals(planSource(flags({ inline: "-" })), { kind: "stdin" });
  assertEquals(planSource(flags({ file: "spec.md" })), {
    kind: "file",
    path: "spec.md",
  });
  assertEquals(planSource(flags({ file: "-" })), { kind: "stdin" });
  assertEquals(planSource(flags()), undefined);
});

Deno.test("an empty inline value is still an inline Source, not an absent one", () => {
  // `--description ""` has always been accepted; what it means is the
  // command's to decide, not this function's.
  assertEquals(planSource(flags({ inline: "" })), { kind: "inline", text: "" });
});

Deno.test("planSource refuses both flags at once, naming both", () => {
  assertThrows(
    () => planSource(flags({ inline: "Just this.", file: "spec.md" })),
    Error,
    "Pass either --description or --description-file, not both.",
  );
});

Deno.test("planSource refuses stdin on an Interactive run, which still may prompt", () => {
  const message =
    "Reading the Description from stdin needs --non-interactive; pass " +
    "--description-file <path> to read a file and still prompt.";

  // Either flag can spell it, and the hazard is the same: reading stdin leaves
  // nothing to answer the prompts with.
  assertThrows(
    () => planSource(flags({ inline: "-", interactive: true })),
    Error,
    message,
  );
  assertThrows(
    () => planSource(flags({ file: "-", interactive: true })),
    Error,
    message,
  );
});

Deno.test("an Interactive run may still read a file, and name one path", () => {
  assertEquals(planSource(flags({ file: "spec.md", interactive: true })), {
    kind: "file",
    path: "spec.md",
  });
  assertEquals(planSource(flags({ inline: "Just this.", interactive: true })), {
    kind: "inline",
    text: "Just this.",
  });
});

Deno.test("a command with no path flag still refuses stdin on an Interactive run", () => {
  // `ergon log` has no `--description-file`, so the advice has to drop the
  // half of itself that does not exist.
  assertThrows(
    () =>
      planSource({
        flag: "--description",
        subject: "worklog description",
        inline: "-",
        interactive: true,
      }),
    Error,
    "Reading the worklog description from stdin needs --non-interactive.",
  );
});

Deno.test("readSource hands inline text back untouched", async () => {
  assertEquals(
    await readSource({ kind: "inline", text: "  " }, {
      subject: "Description",
    }),
    "  ",
  );
});

Deno.test("readSource reads a file", async () => {
  const path = await Deno.makeTempFile({ suffix: ".md" });

  try {
    await Deno.writeTextFile(path, "## Goal\n\n- [ ] ship it\n");
    assertEquals(
      await readSource({ kind: "file", path }, { subject: "Description" }),
      "## Goal\n\n- [ ] ship it\n",
    );
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("readSource reads stdin through the reader it is given", async () => {
  assertEquals(
    await readSource({ kind: "stdin" }, {
      subject: "Description",
      readStdin: () => Promise.resolve("piped in"),
    }),
    "piped in",
  );
});

Deno.test("an empty file is refused, named", async () => {
  const path = await Deno.makeTempFile({ suffix: ".md" });

  try {
    await assertRejects(
      () => readSource({ kind: "file", path }, { subject: "Description" }),
      Error,
      `${path} is empty; a Description needs text.`,
    );

    // Whitespace is nothing too: a file holding a stray newline is the same
    // upstream failure as one holding no bytes.
    await Deno.writeTextFile(path, "\n  \n");
    await assertRejects(
      () => readSource({ kind: "file", path }, { subject: "Description" }),
      Error,
      `${path} is empty; a Description needs text.`,
    );
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("an empty pipe is refused, and says so as a pipe", async () => {
  await assertRejects(
    () =>
      readSource({ kind: "stdin" }, {
        subject: "worklog description",
        readStdin: () => Promise.resolve(""),
      }),
    Error,
    "Nothing arrived on stdin; a worklog description needs text.",
  );
});

Deno.test("a path that names nothing is reported as a missing file", async () => {
  await assertRejects(
    () =>
      readSource({ kind: "file", path: "/nope/spec.md" }, {
        subject: "Description",
      }),
    Error,
    "No such file: /nope/spec.md",
  );
});

Deno.test("assertExpressible passes markdown ergon can write", () => {
  assertEquals(
    assertExpressible("## Goal\n\n- [ ] ship it\n", {
      kind: "file",
      path: "spec.md",
    }),
    undefined,
  );
});

Deno.test("an unexpressible construct from a file names the file to fix", () => {
  assertThrows(
    () =>
      assertExpressible("![a diagram](diagram.png)", {
        kind: "file",
        path: "spec.md",
      }),
    Error,
    "ergon cannot write an image. Jira addresses an attachment by id, which " +
      "markdown has no way to name. Rewrite spec.md without it.",
  );
});

Deno.test("the same construct from a pipe keeps the generic remedy", () => {
  assertThrows(
    () => assertExpressible("![a diagram](diagram.png)", { kind: "stdin" }),
    Error,
    "Rewrite the markdown without it.",
  );
});

Deno.test("refuseBlank still speaks in ergon comment's own words", () => {
  assertEquals(
    refuseBlank("something", "A comment needs a body."),
    "something",
  );

  const thrown = assertThrows(
    () => refuseBlank("\n \t\n", "A comment needs a body."),
    Error,
  );
  assertStringIncludes(thrown.message, "A comment needs a body.");
});

Deno.test("a checklist in a file arrives as a checklist, not as text shaped like one", async () => {
  // The whole point of story 1: what `readSource` hands over is what `toAdf`
  // parses, so the markdown a file holds survives into ADF intact.
  const path = await Deno.makeTempFile({ suffix: ".md" });

  try {
    await Deno.writeTextFile(
      path,
      "## Acceptance criteria\n\n- [ ] refuses a CSV with no header row\n",
    );

    const text = await readSource({ kind: "file", path }, {
      subject: "Description",
    });
    const doc = toAdf(text) as { content: { type: string }[] };

    assertEquals(doc.content.map((block) => block.type), [
      "heading",
      "taskList",
    ]);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("blank inline text means no value, which is what the empty string always meant", () => {
  // The two commands both guard with `if (input.…)` before sending, so `""`
  // was skipped while `"  "` went on as an empty rich-text document. One test
  // for both, because two copies are how two paths come to disagree.
  assertEquals(omitIfBlank(undefined), undefined);
  assertEquals(omitIfBlank(""), undefined);
  assertEquals(omitIfBlank("  \n\t "), undefined);
  assertEquals(omitIfBlank("Fix the redirect."), "Fix the redirect.");
  // Surrounding whitespace is the caller's own formatting, not emptiness.
  assertEquals(omitIfBlank("  Fix it.\n"), "  Fix it.\n");
});
