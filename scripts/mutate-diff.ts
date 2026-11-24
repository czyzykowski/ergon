// Mutation testing of a branch's own changes, run by `.githooks/pre-push`:
// mutates only the lines the branch adds or changes since it left
// `origin/develop`, within the scope `stryker.config.json` mutates, and
// fails on any mutant the tests let live. A timeout fails too: the hook
// cannot tell a mutant that loops from a machine too busy to finish the run.
//
// Usage: deno task mutate:diff

import { globToRegExp } from "path/glob_to_regexp.ts";

const BASE = "origin/develop";
const REPORT = "reports/mutation/mutation.json";
const LOG = "reports/mutation/stryker.log";
const LIMIT_MS = 3 * 60 * 1000;

/** Lines `from` to `to` of `file`, in Stryker's `file:from-to` form. */
export interface Range {
  file: string;
  from: number;
  to: number;
}

/** The added or changed lines of a `git diff -U0`, as one range a hunk. */
export function changedRanges(diff: string): Range[] {
  const ranges: Range[] = [];
  let file: string | undefined;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line === "+++ /dev/null" ? undefined : line.slice("+++ b/".length);
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk || file === undefined) continue;

    const from = Number(hunk[1]);
    const count = Number(hunk[2] ?? "1");
    if (count > 0) ranges.push({ file, from, to: from + count - 1 });
  }
  return ranges;
}

/**
 * Whether Stryker's `mutate` patterns take `file`: some pattern matches it
 * and no `!pattern` excludes it.
 */
export function inScope(file: string, patterns: string[]): boolean {
  const matches = (glob: string) =>
    globToRegExp(glob, { extended: true, globstar: true }).test(file);
  const excluded = patterns.filter((p) => p.startsWith("!"))
    .some((p) => matches(p.slice(1)));
  const included = patterns.filter((p) => !p.startsWith("!")).some(matches);

  return included && !excluded;
}

/** 1-based line and column, as Stryker reports them. */
interface Position {
  line: number;
  column: number;
}

interface ReportedMutant {
  mutatorName: string;
  replacement?: string;
  status: string;
  location: { start: Position; end: Position };
}

/** The parts of Stryker's JSON report this script reads. */
export interface Report {
  files: Record<string, { source: string; mutants: ReportedMutant[] }>;
}

const FAILING = new Set(["Survived", "NoCoverage", "Timeout"]);

/** The first line of `text`, marked as cut when there was more. */
function firstLine(text: string): string {
  const [first = ""] = text.split("\n");
  return first === text ? text : `${first} …`;
}

/** The text of `source` from `start` up to, not including, `end`. */
function textBetween(source: string, start: Position, end: Position): string {
  const lines = source.split("\n");
  const offset = ({ line, column }: Position) =>
    lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0) +
    column - 1;
  return source.slice(offset(start), offset(end));
}

/**
 * One line for each mutant that fails the push:
 * `src/adf.ts:294:41 Survived EqualityOperator: items.length > 0 → items.length >= 0`.
 */
export function failuresOf(report: Report): string[] {
  return Object.entries(report.files).flatMap(([file, { source, mutants }]) =>
    mutants.filter((mutant) => FAILING.has(mutant.status)).map((mutant) => {
      const { start, end } = mutant.location;
      const original = textBetween(source, start, end);
      return `${file}:${start.line}:${start.column} ${mutant.status} ` +
        `${mutant.mutatorName}: ${firstLine(original)} → ` +
        firstLine(mutant.replacement ?? "");
    })
  );
}

async function git(...args: string[]): Promise<string> {
  const { success, stdout, stderr } = await new Deno.Command("git", { args })
    .output();
  const text = new TextDecoder();
  if (!success) {
    throw new Error(`git ${args.join(" ")} failed: ${text.decode(stderr)}`);
  }
  return text.decode(stdout);
}

/**
 * Runs `deno task mutate` over `ranges`, writing its output to `LOG`; false
 * when it ran out of time and was stopped.
 */
async function mutate(ranges: Range[]): Promise<boolean> {
  const targets = ranges.map(({ file, from, to }) => `${file}:${from}-${to}`);
  const child = new Deno.Command(Deno.execPath(), {
    args: ["task", "mutate", ...targets],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  let finished = true;
  const timer = setTimeout(() => {
    finished = false;
    child.kill("SIGTERM");
  }, LIMIT_MS);

  const { stdout, stderr } = await child.output();
  clearTimeout(timer);
  const text = new TextDecoder();
  await Deno.writeTextFile(LOG, text.decode(stdout) + text.decode(stderr));
  return finished;
}

if (import.meta.main) {
  const config = JSON.parse(await Deno.readTextFile("stryker.config.json"));
  const base = (await git("merge-base", "HEAD", BASE)).trim();
  // HEAD, not the working tree: the push sends commits, not uncommitted edits.
  const diff = await git("diff", "-U0", "--no-color", base, "HEAD");
  const ranges = changedRanges(diff)
    .filter((range) => inScope(range.file, config.mutate));

  if (ranges.length === 0) {
    console.log(`No lines in the mutation scope changed since ${BASE}.`);
    Deno.exit(0);
  }

  const files = new Set(ranges.map((range) => range.file)).size;
  console.log(
    `Mutating ${ranges.length} changed range(s) in ${files} file(s); ` +
      `Stryker's output goes to ${LOG}.`,
  );

  await Deno.mkdir("reports/mutation", { recursive: true });
  // A report left from an earlier run must not pass for this one.
  await Deno.remove(REPORT).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });

  if (!await mutate(ranges)) {
    console.error(
      `Mutation testing took over ${LIMIT_MS / 60_000} minutes and was ` +
        `stopped. Split the branch, or run \`deno task mutate\` on the ` +
        `files it changed.`,
    );
    Deno.exit(1);
  }

  const report: Report = JSON.parse(
    await Deno.readTextFile(REPORT).catch(() => {
      throw new Error(`Stryker wrote no report; see ${LOG}.`);
    }),
  );
  const failures = failuresOf(report);

  if (failures.length > 0) {
    console.error(
      `${failures.length} mutant(s) in this branch's changes were not ` +
        `killed. Full report: ${REPORT}.\n` + failures.join("\n"),
    );
    Deno.exit(1);
  }
  console.log("Every mutant in this branch's changes was killed.");
}
