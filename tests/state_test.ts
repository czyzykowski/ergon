import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { loadState, resolveStatePath, saveState } from "../src/state.ts";

Deno.test({
  name: "loadState persists cache metadata",
  permissions: { read: true, write: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ dir: Deno.cwd() });
    const state = {
      lastProject: "PGR",
      lastEpic: "PGR-1",
      lastIssueKey: "PGR-2",
      lastClientSow: "Client SOW",
      cache: {
        epics: {
          PGR: [{ key: "PGR-1", summary: "Epic summary" }],
        },
        labels: ["infra", "ops"],
        clientSowOptions: {
          customfield_10200: [{ id: "100", value: "Client SOW" }],
        },
        boards: {
          PGR: [{ id: 7, name: "Main board" }],
        },
        sprints: {
          "7": [{ id: 42, name: "Sprint 42", state: "active" }],
        },
      },
    };

    try {
      await saveState(state, tempDir);
      const loaded = await loadState(tempDir);

      assertEquals(loaded, state);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "loadState returns empty when missing",
  permissions: { read: true, write: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ dir: Deno.cwd() });

    try {
      const loaded = await loadState(tempDir);
      assertEquals(loaded, {});
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "resolveStatePath uses baseDir",
  permissions: { read: true },
  fn() {
    const result = resolveStatePath("/tmp/ergon-state");
    assertEquals(result, "/tmp/ergon-state/.config/ergon/state.json");
  },
});

Deno.test({
  name: "loadState rejects invalid JSON",
  permissions: { read: true, write: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ dir: Deno.cwd() });
    const statePath = resolveStatePath(tempDir);

    try {
      await Deno.mkdir(
        new URL(".", new URL(`file://${statePath}`)).pathname,
        { recursive: true },
      );
      await Deno.writeTextFile(statePath, "not-json");

      await assertRejects(() => loadState(tempDir), SyntaxError);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});
