// Fails when line or branch coverage, read from an lcov report on stdin, is
// below its floor. CI runs it through `deno task coverage:check`.
//
// Usage: deno coverage --lcov coverage |
//          deno run scripts/check-coverage.ts <lines %> <branches %>

export interface Coverage {
  lines: number;
  branches: number;
}

type Total = "LF" | "LH" | "BRF" | "BRH";

/** Line and branch coverage, in percent, summed over every file of the report. */
export function coverageOf(lcov: string): Coverage {
  const totals: Record<Total, number> = { LF: 0, LH: 0, BRF: 0, BRH: 0 };

  for (const line of lcov.split("\n")) {
    const [key = "", count = ""] = line.split(":", 2);
    if (Object.hasOwn(totals, key)) totals[key as Total] += Number(count);
  }

  if (totals.LF === 0) throw new Error("The lcov report covers no lines.");

  return {
    lines: (100 * totals.LH) / totals.LF,
    branches: totals.BRF === 0 ? 100 : (100 * totals.BRH) / totals.BRF,
  };
}

/** One message for each measure below its floor. */
export function shortfalls(coverage: Coverage, floors: Coverage): string[] {
  return (["lines", "branches"] as const)
    .filter((measure) => coverage[measure] < floors[measure])
    .map((measure) =>
      `${measure} ${coverage[measure].toFixed(1)}% is below the ` +
      `${floors[measure]}% floor`
    );
}

if (import.meta.main) {
  const [lines, branches] = Deno.args.map(Number);
  if (
    lines === undefined || branches === undefined ||
    Number.isNaN(lines) || Number.isNaN(branches)
  ) {
    console.error(
      "Usage: deno coverage --lcov coverage | " +
        "deno run scripts/check-coverage.ts <lines %> <branches %>",
    );
    Deno.exit(2);
  }

  const coverage = coverageOf(await new Response(Deno.stdin.readable).text());
  console.log(
    `Coverage: lines ${coverage.lines.toFixed(1)}%, ` +
      `branches ${coverage.branches.toFixed(1)}%.`,
  );

  const missed = shortfalls(coverage, { lines, branches });
  if (missed.length > 0) {
    console.error(missed.join("\n"));
    Deno.exit(1);
  }
}
