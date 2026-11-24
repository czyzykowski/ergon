import { assertEquals } from "testing/asserts.ts";
import plugin from "../lint/atomic-write.ts";

const lint = (source: string, file = "/repo/src/store.ts") =>
  Deno.lint.runPlugin(plugin, file, source).map((found) => found.id);

Deno.test("a write renamed into place by the same function passes", () => {
  assertEquals(
    lint(`
      export async function save(path: string, text: string) {
        const temp = path + ".tmp";
        await Deno.writeTextFile(temp, text);
        await Deno.rename(temp, path);
      }
    `),
    [],
  );
});

Deno.test("a direct write under src/ is reported, sync or async", () => {
  assertEquals(
    lint(`
      export async function save(path: string, text: string) {
        await Deno.writeTextFile(path, text);
        Deno.writeFileSync(path, new Uint8Array());
      }
    `),
    ["ergon/atomic-write", "ergon/atomic-write"],
  );
});

Deno.test("a rename in another function does not cover the write", () => {
  assertEquals(
    lint(`
      async function write(temp: string) { await Deno.writeFile(temp, new Uint8Array()); }
      async function move(temp: string, path: string) { await Deno.rename(temp, path); }
    `),
    ["ergon/atomic-write"],
  );
});

Deno.test("renaming a different variable does not cover the write", () => {
  assertEquals(
    lint(`
      export async function save(temp: string, other: string, path: string) {
        await Deno.writeTextFile(temp, "x");
        await Deno.rename(other, path);
      }
    `),
    ["ergon/atomic-write"],
  );
});

Deno.test("files outside src/ may write directly", () => {
  assertEquals(
    lint(
      `await Deno.writeTextFile("fixture.json", "{}");`,
      "/repo/tests/a_test.ts",
    ),
    [],
  );
});

Deno.test("a fresh temp file from the same function may be written directly", () => {
  assertEquals(
    lint(`
      export async function scratch(text: string) {
        const path = await Deno.makeTempFile();
        await Deno.writeTextFile(path, text);
        const other = Deno.makeTempFileSync();
        Deno.writeFileSync(other, new Uint8Array());
      }
    `),
    [],
  );
});

Deno.test("a temp file does not cover a write to another path", () => {
  assertEquals(
    lint(`
      export async function save(path: string) {
        const temp = await Deno.makeTempFile();
        await Deno.writeTextFile(path, temp);
      }
    `),
    ["ergon/atomic-write"],
  );
});
