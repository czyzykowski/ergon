import { assertEquals } from "testing/asserts.ts";
import { isNoneValue, parseLabels } from "../src/flags.ts";

Deno.test("parseLabels trims, drops blanks, and returns undefined when empty", () => {
  assertEquals(parseLabels(" a , b ,, "), ["a", "b"]);
  assertEquals(parseLabels(" , "), undefined);
  assertEquals(parseLabels(""), undefined);
  assertEquals(parseLabels(undefined), undefined);
});

Deno.test("isNoneValue matches the sentinel case-insensitively", () => {
  assertEquals(isNoneValue(" None "), true);
  assertEquals(isNoneValue("none"), true);
  assertEquals(isNoneValue("nonexistent"), false);
  assertEquals(isNoneValue(undefined), false);
});
