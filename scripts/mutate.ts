import { StrykerCli } from "@stryker-mutator/core";

export function strykerArgv(files: string[]): string[] {
  const mutate = files.length > 0 ? ["--mutate", files.join(",")] : [];
  return ["deno", "stryker", "run", ...mutate];
}

if (import.meta.main) {
  new StrykerCli(strykerArgv(Deno.args)).run();
}
