import { assertRejects } from "testing/asserts.ts";
import {
  nonInteractivePrompter,
  type Prompter,
} from "../src/commands/new_prompter.ts";

const QUESTIONS: Record<keyof Prompter, () => Promise<unknown>> = {
  project: () => nonInteractivePrompter.project({ PCK: "Pickaxe" }),
  epic: () =>
    nonInteractivePrompter.epic([{ key: "PCK-1", summary: "An Epic" }]),
  summary: () => nonInteractivePrompter.summary(),
  parentQuery: () => nonInteractivePrompter.parentQuery(["Story"]),
  parent: () =>
    nonInteractivePrompter.parent([{ key: "PCK-2", summary: "A Story" }], [
      "Story",
    ]),
  labels: () => nonInteractivePrompter.labels(["Druid"]),
  clientSow: () =>
    nonInteractivePrompter.clientSow(
      [{ id: "10084", value: "Client SOW A" }],
      "10084",
    ),
  board: () => nonInteractivePrompter.board([{ id: 26, name: "PCK board" }]),
  sprint: () => nonInteractivePrompter.sprint([{ id: 1328, name: "Sprint 5" }]),
};

for (const [method, ask] of Object.entries(QUESTIONS)) {
  Deno.test(`a Non-interactive run asking ${method}() is a bug, named as such`, async () => {
    await assertRejects(ask, Error, `Prompter.${method}()`);
  });
}
