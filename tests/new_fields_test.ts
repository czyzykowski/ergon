import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  isNoneValue,
  parentFieldsFrom,
  parseLabels,
  requireClientSowFieldId,
  resolveFields,
} from "../src/commands/new_fields.ts";
import type {
  ClientSowPlan,
  ResolveFieldsInput,
} from "../src/commands/new_fields.ts";

const PARENT_LABELLED = {
  clientSow: { id: "10084", value: "Pickaxe: Internal Projects" },
  labels: ["Druid", "Infrastructure"],
};

const PARENT_BARE = { clientSow: undefined, labels: [] };

const FIELD_DEFAULTS = {
  clientSowValue: "Client SOW A",
  labels: ["client-a"],
};

function resolve(overrides: Partial<ResolveFieldsInput> = {}) {
  return resolveFields({
    interactive: false,
    fieldDefaults: FIELD_DEFAULTS,
    lastClientSow: "10099",
    ...overrides,
  });
}

Deno.test("non-interactive inherits both fields from a populated parent", () => {
  const resolved = resolve({ parent: PARENT_LABELLED });

  assertEquals(resolved.labels, ["Druid", "Infrastructure"]);
  assertEquals(resolved.needsLabelPrompt, false);
  assertEquals(resolved.clientSow, {
    kind: "payload",
    payload: { id: "10084" },
  });
});

Deno.test("non-interactive falls through a bare parent to config defaults", () => {
  const resolved = resolve({ parent: PARENT_BARE });

  assertEquals(resolved.labels, ["client-a"]);
  assertEquals(resolved.needsLabelPrompt, false);
  assertEquals(resolved.clientSow, { kind: "lookup", value: "Client SOW A" });
});

Deno.test("non-interactive never reads remembered state", () => {
  const resolved = resolve({ parent: PARENT_BARE, fieldDefaults: undefined });

  assertEquals(resolved.labels, undefined);
  assertEquals(resolved.clientSow, { kind: "skip" });
});

Deno.test("interactive prompts for labels when the parent has none", () => {
  const resolved = resolve({ interactive: true, parent: PARENT_BARE });

  // An empty parent array short circuits the chain here, so the configured
  // labels are deliberately not applied.
  assertEquals(resolved.labels, []);
  assertEquals(resolved.needsLabelPrompt, true);
});

Deno.test("interactive prompts for labels when there is no parent at all", () => {
  const resolved = resolve({ interactive: true, fieldDefaults: undefined });

  assertEquals(resolved.labels, undefined);
  assertEquals(resolved.needsLabelPrompt, true);
});

Deno.test("interactive takes parent labels without prompting", () => {
  const resolved = resolve({ interactive: true, parent: PARENT_LABELLED });

  assertEquals(resolved.labels, ["Druid", "Infrastructure"]);
  assertEquals(resolved.needsLabelPrompt, false);
});

Deno.test("interactive defaults the SOW prompt to the parent", () => {
  const resolved = resolve({ interactive: true, parent: PARENT_LABELLED });

  assertEquals(resolved.clientSow, { kind: "prompt", default: "10084" });
});

Deno.test("interactive defaults the SOW prompt to remembered state next", () => {
  const resolved = resolve({ interactive: true, parent: PARENT_BARE });

  assertEquals(resolved.clientSow, { kind: "prompt", default: "10099" });
});

Deno.test("interactive defaults the SOW prompt to config last", () => {
  const resolved = resolve({ interactive: true, lastClientSow: undefined });

  assertEquals(resolved.clientSow, {
    kind: "prompt",
    default: "Client SOW A",
  });
});

Deno.test("explicit labels replace inherited ones", () => {
  const resolved = resolve({
    parent: PARENT_LABELLED,
    labelsOption: "urgent, spike",
  });

  assertEquals(resolved.labels, ["urgent", "spike"]);
  assertEquals(resolved.needsLabelPrompt, false);
});

Deno.test("--labels none clears inherited labels in both modes", () => {
  for (const interactive of [true, false]) {
    const resolved = resolve({
      interactive,
      parent: PARENT_LABELLED,
      labelsOption: "NONE ",
    });

    assertEquals(resolved.labels, undefined);
    assertEquals(resolved.needsLabelPrompt, false);
  }
});

Deno.test("none is only a sentinel when it is the whole value", () => {
  const resolved = resolve({ labelsOption: "none,urgent" });

  assertEquals(resolved.labels, ["none", "urgent"]);
});

Deno.test("--client-sow none clears an inherited SOW", () => {
  const resolved = resolve({
    parent: PARENT_LABELLED,
    clientSowOption: "none",
  });

  assertEquals(resolved.clientSow, { kind: "skip" });
});

Deno.test("--client-sow overrides an inherited SOW", () => {
  const resolved = resolve({
    parent: PARENT_LABELLED,
    clientSowOption: "Client SOW B",
  });

  assertEquals(resolved.clientSow, { kind: "lookup", value: "Client SOW B" });
});

Deno.test("a parent SOW without an id falls back to its value", () => {
  const resolved = resolve({ parent: { clientSow: { value: "Legacy SOW" } } });

  assertEquals(resolved.clientSow, {
    kind: "payload",
    payload: { value: "Legacy SOW" },
  });
});

Deno.test("parentFieldsFrom reads a Jira single-select field", () => {
  const parent = parentFieldsFrom({
    customfield_10200: {
      self: "https://example.atlassian.net/rest/api/3/customFieldOption/10084",
      value: "Pickaxe: Internal Projects",
      id: "10084",
    },
    labels: ["Druid", 7, "Prometheus"],
  }, "customfield_10200");

  assertEquals(parent.clientSow, {
    id: "10084",
    value: "Pickaxe: Internal Projects",
  });
  assertEquals(parent.labels, ["Druid", "Prometheus"]);
});

Deno.test("parentFieldsFrom tolerates an absent SOW field", () => {
  const parent = parentFieldsFrom({ labels: [] }, "customfield_10200");

  assertEquals(parent.clientSow, undefined);
  assertEquals(parent.labels, []);
});

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

Deno.test("parentFieldsFrom inherits labels alone without a SOW field", () => {
  const parent = parentFieldsFrom(
    { labels: ["Druid"], customfield_10200: { id: "10084" } },
    undefined,
  );

  assertEquals(parent.clientSow, undefined);
  assertEquals(parent.labels, ["Druid"]);
});

const PLANS_NEEDING_A_FIELD: ClientSowPlan[] = [
  { kind: "lookup", value: "Client SOW A" },
  { kind: "prompt", default: "Client SOW A" },
  { kind: "payload", payload: { id: "10084" } },
];

Deno.test("requireClientSowFieldId returns the id to every plan that uses one", () => {
  for (const plan of PLANS_NEEDING_A_FIELD) {
    assertEquals(
      requireClientSowFieldId(plan, "customfield_10200", "PGR"),
      "customfield_10200",
      `plan ${plan.kind} should resolve the configured field`,
    );
  }
});

Deno.test("requireClientSowFieldId throws when a plan needs an unconfigured field", () => {
  for (const plan of PLANS_NEEDING_A_FIELD) {
    assertThrows(
      () => requireClientSowFieldId(plan, undefined, "PGR"),
      Error,
      "clientSowFieldId",
      `plan ${plan.kind} should refuse to guess a field`,
    );
  }
});

Deno.test("requireClientSowFieldId lets a skipped SOW pass without a field", () => {
  const plan: ClientSowPlan = { kind: "skip" };

  assertEquals(requireClientSowFieldId(plan, undefined, "PGR"), undefined);
  assertEquals(
    requireClientSowFieldId(plan, "customfield_10200", "PGR"),
    undefined,
  );
});
