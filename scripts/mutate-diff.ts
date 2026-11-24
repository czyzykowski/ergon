import { globToRegExp } from "path/glob_to_regexp.ts";

const BASE = "origin/develop";
const REPORT = "reports/mutation/mutation.json";
const LOG = "reports/mutation/stryker.log";
const STRYKER_SANDBOX = ".stryker-tmp";
const LIMIT_MS = 3 * 60 * 1000;

export interface Range {
  file: string;
  from: number;
  to: number;
}

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

export function inScope(file: string, patterns: string[]): boolean {
  const matches = (glob: string) =>
    globToRegExp(glob, { extended: true, globstar: true }).test(file);
  const excluded = patterns.filter((p) => p.startsWith("!"))
    .some((p) => matches(p.slice(1)));
  const included = patterns.filter((p) => !p.startsWith("!")).some(matches);

  return included && !excluded;
}

interface OneBasedPosition {
  line: number;
  column: number;
}

interface ReportedMutant {
  mutatorName: string;
  replacement?: string;
  status: string;
  location: { start: OneBasedPosition; end: OneBasedPosition };
}

export interface Report {
  files: Record<string, { source: string; mutants: ReportedMutant[] }>;
}

const FAILING = new Set(["Survived", "NoCoverage", "Timeout"]);

function firstLineMarkedIfCut(text: string): string {
  const [first = ""] = text.split("\n");
  return first === text ? text : `${first} …`;
}

function textFromStartToBeforeEnd(
  source: string,
  start: OneBasedPosition,
  end: OneBasedPosition,
): string {
  const lines = source.split("\n");
  const offset = ({ line, column }: OneBasedPosition) =>
    lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0) +
    column - 1;
  return source.slice(offset(start), offset(end));
}

export function failuresOf(report: Report): string[] {
  return Object.entries(report.files).flatMap(([file, { source, mutants }]) =>
    mutants.filter((mutant) => FAILING.has(mutant.status)).map((mutant) => {
      const { start, end } = mutant.location;
      const original = textFromStartToBeforeEnd(source, start, end);
      return `${file}:${start.line}:${start.column} ${mutant.status} ` +
        `${mutant.mutatorName}: ${firstLineMarkedIfCut(original)} → ` +
        firstLineMarkedIfCut(mutant.replacement ?? "");
    })
  );
}

async function removeIfPresent(path: string): Promise<void> {
  await Deno.remove(path, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
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

async function committedChangesSince(base: string): Promise<string> {
  return await git("diff", "-U0", "--no-color", base, "HEAD");
}

async function mutateWithinLimit(
  ranges: Range[],
): Promise<"finished" | "timed out"> {
  const targets = ranges.map(({ file, from, to }) => `${file}:${from}-${to}`);
  const child = new Deno.Command(Deno.execPath(), {
    args: ["task", "mutate", ...targets],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  let outcome: "finished" | "timed out" = "finished";
  const timer = setTimeout(() => {
    outcome = "timed out";
    child.kill("SIGTERM");
  }, LIMIT_MS);

  const { stdout, stderr } = await child.output();
  clearTimeout(timer);
  const text = new TextDecoder();
  await Deno.writeTextFile(LOG, text.decode(stdout) + text.decode(stderr));
  return outcome;
}

if (import.meta.main) {
  const config = JSON.parse(await Deno.readTextFile("stryker.config.json"));
  const base = (await git("merge-base", "HEAD", BASE)).trim();
  const ranges = changedRanges(await committedChangesSince(base))
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
  await removeIfPresent(REPORT);

  if (await mutateWithinLimit(ranges) === "timed out") {
    await removeIfPresent(STRYKER_SANDBOX);
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
