// Mutation testing on demand: mutates the scope in `stryker.config.json`, or
// only the files given, and writes the HTML and JSON reports under
// `reports/mutation/`. A file may carry a line range, `src/adf.ts:10-20`.
//
// Usage: deno task mutate [file[:from-to]…]
//
// This drives Stryker's CLI rather than `new Stryker().runMutationTest()`:
// under Deno, Stryker never finishes closing its logging server, so that
// promise never settles, while the CLI leaves nothing waiting on it and the
// process ends once the reports are written.

import { StrykerCli } from "@stryker-mutator/core";

/** Stryker's argv for a run over `files`, or over the configured scope. */
export function strykerArgv(files: string[]): string[] {
  const mutate = files.length > 0 ? ["--mutate", files.join(",")] : [];
  return ["deno", "stryker", "run", ...mutate];
}

if (import.meta.main) {
  new StrykerCli(strykerArgv(Deno.args)).run();
}
