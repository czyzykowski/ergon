import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "testing/asserts.ts";
import { toAdf } from "../src/adf.ts";
import {
  omitIfBlank,
  readRichText,
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

/** A stdin that holds `text`, or fails the test if it is ever read. */
function stdin(text?: string): () => Promise<string> {
  return () =>
    text === undefined
      ? Promise.reject(new Error("stdin was read"))
      : Promise.resolve(text);
}

async function withFile<T>(
  text: string,
  run: (path: string) => Promise<T>,
): Promise<T> {
  const path = await Deno.makeTempFile({ suffix: ".md" });

  try {
    await Deno.writeTextFile(path, text);
    return await run(path);
  } finally {
    await Deno.remove(path);
  }
}

Deno.test("no flag names no Source, and reads nothing", async () => {
  assertEquals(await readRichText(flags(), stdin()), undefined);
});

Deno.test("inline text is handed back untouched, without reading stdin", async () => {
  assertEquals(
    await readRichText(flags({ inline: "Just this." }), stdin()),
    "Just this.",
  );
  // Blank inline text is the caller's own, so what it means is the command's
  // to decide: `ergon edit --description ""` clears the field.
  assertEquals(await readRichText(flags({ inline: "" }), stdin()), "");
  assertEquals(await readRichText(flags({ inline: "  " }), stdin()), "  ");
});

Deno.test("- on either flag reads stdin", async () => {
  assertEquals(
    await readRichText(flags({ inline: "-" }), stdin("piped in")),
    "piped in",
  );
  assertEquals(
    await readRichText(flags({ file: "-" }), stdin("piped in")),
    "piped in",
  );
});

Deno.test("a path reads the file", async () => {
  await withFile("## Goal\n\n- [ ] ship it\n", async (path) => {
    assertEquals(
      await readRichText(flags({ file: path }), stdin()),
      "## Goal\n\n- [ ] ship it\n",
    );
  });
});

Deno.test("both flags at once is refused, naming both", async () => {
  await assertRejects(
    () =>
      readRichText(
        flags({ inline: "Just this.", file: "spec.md" }),
        stdin(),
      ),
    Error,
    "Pass either --description or --description-file, not both.",
  );
});

Deno.test("stdin is refused on an Interactive run, which still may prompt", async () => {
  const message =
    "Reading the Description from stdin needs --non-interactive; pass " +
    "--description-file <path> to read a file and still prompt.";

  // Either flag can spell it, and the hazard is the same: reading stdin leaves
  // nothing to answer the prompts with. The refusal comes before the read.
  await assertRejects(
    () => readRichText(flags({ inline: "-", interactive: true }), stdin()),
    Error,
    message,
  );
  await assertRejects(
    () => readRichText(flags({ file: "-", interactive: true }), stdin()),
    Error,
    message,
  );
});

Deno.test("an Interactive run may still read a file, or take inline text", async () => {
  await withFile("From a file.", async (path) => {
    assertEquals(
      await readRichText(flags({ file: path, interactive: true }), stdin()),
      "From a file.",
    );
  });
  assertEquals(
    await readRichText(
      flags({ inline: "Just this.", interactive: true }),
      stdin(),
    ),
    "Just this.",
  );
});

Deno.test("a command with no path flag still refuses stdin on an Interactive run", async () => {
  // A command without a `--<field>-file` flag gets advice without the half of
  // itself that does not exist.
  await assertRejects(
    () =>
      readRichText({
        flag: "--description",
        subject: "worklog description",
        inline: "-",
        interactive: true,
      }, stdin()),
    Error,
    "Reading the worklog description from stdin needs --non-interactive.",
  );
});

Deno.test("an empty file is refused, named", async () => {
  await withFile("", async (path) => {
    await assertRejects(
      () => readRichText(flags({ file: path }), stdin()),
      Error,
      `${path} is empty; a Description needs text.`,
    );
  });

  // Whitespace is nothing too: a file holding a stray newline is the same
  // upstream failure as one holding no bytes.
  await withFile("\n  \n", async (path) => {
    await assertRejects(
      () => readRichText(flags({ file: path }), stdin()),
      Error,
      `${path} is empty; a Description needs text.`,
    );
  });
});

Deno.test("an empty pipe is refused, and says so as a pipe", async () => {
  await assertRejects(
    () =>
      readRichText(
        { flag: "--description", subject: "worklog description", inline: "-" },
        stdin(""),
      ),
    Error,
    "Nothing arrived on stdin; a worklog description needs text.",
  );
});

Deno.test("a path that names nothing is reported as a missing file", async () => {
  await assertRejects(
    () => readRichText(flags({ file: "/nope/spec.md" }), stdin()),
    Error,
    "No such file: /nope/spec.md",
  );
});

Deno.test("an unexpressible construct from a file names the file to fix", async () => {
  await withFile("![a diagram](diagram.png)", async (path) => {
    await assertRejects(
      () => readRichText(flags({ file: path }), stdin()),
      Error,
      "ergon cannot write an image. Jira addresses an attachment by id, " +
        `which markdown has no way to name. Rewrite ${path} without it.`,
    );
  });
});

Deno.test("the same construct from a pipe or inline keeps the generic remedy", async () => {
  await assertRejects(
    () =>
      readRichText(flags({ inline: "-" }), stdin("![a diagram](diagram.png)")),
    Error,
    "Rewrite the markdown without it.",
  );
  await assertRejects(
    () => readRichText(flags({ inline: "![a diagram](diagram.png)" }), stdin()),
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
  // What `readRichText` hands over is what `toAdf` parses, so the markdown a
  // file holds survives into ADF intact.
  const text = await withFile(
    "## Acceptance criteria\n\n- [ ] refuses a CSV with no header row\n",
    (path) => readRichText(flags({ file: path }), stdin()),
  );
  const doc = toAdf(text ?? "") as { content: { type: string }[] };

  assertEquals(doc.content.map((block) => block.type), [
    "heading",
    "taskList",
  ]);
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
