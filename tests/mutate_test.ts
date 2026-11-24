import { assertEquals } from "testing/asserts.ts";
import { strykerArgv } from "../scripts/mutate.ts";

Deno.test("no files runs the configured scope", () => {
  assertEquals(strykerArgv([]), ["deno", "stryker", "run"]);
});

Deno.test("files and line ranges become one --mutate list", () => {
  assertEquals(strykerArgv(["src/adf.ts", "src/config.ts:10-20"]), [
    "deno",
    "stryker",
    "run",
    "--mutate",
    "src/adf.ts,src/config.ts:10-20",
  ]);
});
