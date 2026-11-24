import { dirname, fromFileUrl, join, relative } from "path/mod.ts";

const CHECKED_PATH = /^(?:src|tests|scripts|lint)\/.+\.ts$/;
const DIFF_TARGET = /^\+\+\+ b\/(.+)$/;
const HUNK_ADDING = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/;
const FILE_IGNORE = /deno-lint-ignore-file/g;
const PLUGIN = fromFileUrl(new URL("../lint/no-comments.ts", import.meta.url));

export interface Finding {
  path: string;
  line: number;
  message: string;
}

interface Diagnostic extends Finding {
  lastLine: number;
}

interface LintReport {
  diagnostics: Array<{
    filename: string;
    range: { start: { line: number }; end: { line: number } };
    message: string;
  }>;
  errors: Array<{ file_path: string; message: string }>;
}

export function addedLines(diff: string): Map<string, Set<number>> {
  const added = new Map<string, Set<number>>();
  let lines: Set<number> | undefined;

  for (const line of diff.split("\n")) {
    const target = DIFF_TARGET.exec(line);
    if (target) {
      const path = target[1] ?? "";
      lines = CHECKED_PATH.test(path) ? new Set() : undefined;
      if (lines) added.set(path, lines);
      continue;
    }

    const hunk = HUNK_ADDING.exec(line);
    if (hunk && lines) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let number = start; number < start + count; number++) {
        lines.add(number);
      }
    }
  }

  return added;
}

export async function commentsOnAddedLines(
  repo: string,
  base?: string,
): Promise<Finding[]> {
  const range = base === undefined ? ["--cached"] : [`${base}...HEAD`];
  const added = addedLines(
    await git(
      repo,
      "diff",
      "--no-renames",
      "--diff-filter=AM",
      "--unified=0",
      "--no-color",
      ...range,
    ),
  );
  if (added.size === 0) return [];

  const revision = base === undefined ? "" : "HEAD";
  const copies = await Deno.realPath(
    await Deno.makeTempDir({ prefix: "ergon-check-comments-" }),
  );
  try {
    for (const path of added.keys()) {
      const source = await git(repo, "show", `${revision}:${path}`);
      await copy(join(copies, path), source);
    }
    const diagnostics = await lint(copies, [...added.keys()]);
    return diagnostics
      .filter(({ path, line, lastLine }) =>
        [...added.get(path) ?? []].some((n) => n >= line && n <= lastLine)
      )
      .map(({ path, line, message }) => ({ path, line, message }));
  } finally {
    await Deno.remove(copies, { recursive: true });
  }
}

async function copy(path: string, source: string): Promise<void> {
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.writeTextFile(path, keepFileIgnoresFromSkippingTheCheck(source));
}

function keepFileIgnoresFromSkippingTheCheck(source: string): string {
  return source.replace(FILE_IGNORE, "deno-lint-ignore-FILE");
}

async function lint(root: string, paths: string[]): Promise<Diagnostic[]> {
  const config = join(root, "deno.json");
  await Deno.writeTextFile(
    config,
    JSON.stringify({ lint: { plugins: [PLUGIN], rules: { tags: [] } } }),
  );

  const { stdout, stderr } = await new Deno.Command("deno", {
    args: ["lint", "--json", "--config", config, ...paths],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();

  const output = new TextDecoder().decode(stdout);
  if (output.trim() === "") {
    throw new Error(`deno lint failed: ${new TextDecoder().decode(stderr)}`);
  }
  const report = JSON.parse(output) as LintReport;
  if (report.errors.length > 0) {
    const errors = report.errors.map((e) => `${e.file_path}: ${e.message}`);
    throw new Error(`deno lint could not read:\n${errors.join("\n")}`);
  }

  return report.diagnostics.map((found) => ({
    path: relative(root, fromFileUrl(found.filename)),
    line: found.range.start.line,
    lastLine: found.range.end.line,
    message: found.message,
  }));
}

async function git(repo: string, ...args: string[]): Promise<string> {
  const { success, stdout, stderr } = await new Deno.Command("git", {
    args: ["-C", repo, ...args],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!success) {
    throw new Error(
      `git ${args.join(" ")} failed: ${new TextDecoder().decode(stderr)}`,
    );
  }
  return new TextDecoder().decode(stdout);
}

if (import.meta.main) {
  const [base] = Deno.args;
  const findings = await commentsOnAddedLines(Deno.cwd(), base);
  for (const { path, line, message } of findings) {
    console.error(`${path}:${line}: ${message}`);
  }
  if (findings.length > 0) Deno.exit(1);
}
