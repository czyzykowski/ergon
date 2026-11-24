/**
 * Where a rich-text value comes from, for the flags that carry one.
 *
 * A flag either carries the text itself or names a Source to read it from: the
 * path `-` means stdin, a `--<field>-file` flag means that file. Every command
 * with a rich-text flag reads it through `readRichText`, so what `-` means, and
 * what counts as nothing arriving, is decided here once.
 */

import { toAdf, UnexpressibleError } from "./adf.ts";

/** Where a rich-text value is read from. */
type Source =
  | { kind: "inline"; text: string }
  | { kind: "stdin" }
  | { kind: "file"; path: string };

/** How a command spells its rich-text flags, and what the text is. */
export interface SourceFlags {
  /** The inline flag's value, if given. */
  inline?: string;
  /** The path flag's value, if given. Absent on a command that has none. */
  file?: string;
  /** The inline flag, as typed: `--description`. */
  flag: string;
  /** The path flag, as typed. Absent on a command that has none. */
  fileFlag?: string;
  /** The text, as a bare noun phrase: `Description`. */
  subject: string;
  /**
   * Whether this is an Interactive run — one permitted to prompt, which stdin
   * would leave nothing to answer. The glossary's word, not a synonym for it.
   */
  interactive?: boolean;
}

/** How stdin is read, so that a test can hand over something else. */
export type StdinReader = () => Promise<string>;

/**
 * The rich text an invocation supplies, or undefined when it names no Source.
 *
 * Everything that can be refused is refused here, before the caller prompts or
 * calls Jira: both flags at once, stdin on a run that may still prompt, a pipe
 * or file holding nothing, and markdown ergon cannot write (ADR 0010). Inline
 * text is handed back as it came, blank or not, because what blank means is the
 * command's to decide.
 */
export async function readRichText(
  flags: SourceFlags,
  readStdin: StdinReader = readRealStdin,
): Promise<string | undefined> {
  const source = planSource(flags);
  if (!source) return undefined;

  const text = await readSource(source, flags.subject, readStdin);
  assertExpressible(text, source);

  return text;
}

/**
 * Which Source an invocation names, or undefined when it names none.
 *
 * Both flags at once is refused rather than resolved by precedence: nothing in
 * the invocation says which was meant, and a precedence rule is a coin flip the
 * caller has to remember.
 */
function planSource(flags: SourceFlags): Source | undefined {
  if (flags.inline !== undefined && flags.file !== undefined) {
    throw new Error(
      `Pass either ${flags.flag} or ${flags.fileFlag}, not both.`,
    );
  }

  const source = namedSource(flags);

  // A command that may still prompt has only one stdin, and the prompts need
  // it. Reading the Source first does not fail — it hangs at the first prompt,
  // with no output at all — so the combination is refused up front.
  if (source?.kind === "stdin" && flags.interactive) {
    throw new Error(
      `Reading the ${flags.subject} from stdin needs --non-interactive` +
        (flags.fileFlag
          ? `; pass ${flags.fileFlag} <path> to read a file and still prompt.`
          : "."),
    );
  }

  return source;
}

function namedSource(flags: SourceFlags): Source | undefined {
  if (flags.file !== undefined) {
    return flags.file === "-" ? { kind: "stdin" } : {
      kind: "file",
      path: flags.file,
    };
  }

  if (flags.inline !== undefined) {
    return flags.inline === "-" ? { kind: "stdin" } : {
      kind: "inline",
      text: flags.inline,
    };
  }

  return undefined;
}

/**
 * The text a Source holds.
 *
 * A file or a pipe that holds nothing is refused: naming a Source asserts there
 * is text, so an empty one is an upstream failure — a wrong path, a generator
 * that produced nothing, an empty heredoc. Inline text is handed back as it
 * came, blank or not, because the caller supplied it rather than naming a place
 * to find it.
 */
async function readSource(
  source: Source,
  subject: string,
  readStdin: StdinReader,
): Promise<string> {
  switch (source.kind) {
    case "inline":
      return source.text;
    case "stdin":
      return refuseBlank(
        await readStdin(),
        `Nothing arrived on stdin; a ${subject} needs text.`,
      );
    case "file":
      return refuseBlank(
        await readFile(source.path),
        `${source.path} is empty; a ${subject} needs text.`,
      );
  }
}

async function readFile(path: string): Promise<string> {
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`No such file: ${path}`);
    }

    throw error;
  }
}

function readRealStdin(): Promise<string> {
  return new Response(Deno.stdin.readable).text();
}

/**
 * Refuse markdown ADR 0010 will not write, at the moment the Source is read
 * rather than at the moment the issue is created. The refusal is the same
 * either way; what moves is when it lands — before the prompts and before the
 * first Jira call, rather than after six answers and two round-trips.
 *
 * The cost is parsing the body twice, which is a pure in-memory parse of a
 * document small enough to be a ticket.
 */
function assertExpressible(text: string, source: Source): void {
  try {
    toAdf(text);
  } catch (error) {
    // A draft in a file is a draft the caller can open, so the remedy names it
    // instead of saying "the markdown". A pipe has no name to give.
    if (error instanceof UnexpressibleError && source.kind === "file") {
      throw new UnexpressibleError(
        error.construct,
        error.reason,
        `Rewrite ${source.path} without it.`,
      );
    }

    throw error;
  }
}

/**
 * The text, or undefined when there is effectively none.
 *
 * Only inline text ever reaches here blank — a Source that held nothing was
 * refused at the read — and blank inline text has always meant no value:
 * `createIssue` and `worklogBody` both guard with `if (input.…)`, which skipped
 * `""` while sending `"  "` on as an empty rich-text document. One place
 * decides, because two copies of this test are how two paths come to disagree
 * about what "empty" means.
 */
export function omitIfBlank(text: string | undefined): string | undefined {
  return text !== undefined && text.trim().length > 0 ? text : undefined;
}

/**
 * Refuse text that is empty or only whitespace. The complaint is passed in
 * whole, because what counts as "nothing" reads differently depending on where
 * the nothing came from.
 */
export function refuseBlank(text: string, complaint: string): string {
  if (text.trim().length === 0) {
    throw new Error(complaint);
  }

  return text;
}
