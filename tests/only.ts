import { assert, assertEquals } from "testing/asserts.ts";

/** The one item of a list, failing the test unless there is exactly one. */
export function only<T>(items: readonly T[]): T {
  assertEquals(items.length, 1, `expected one item, got ${items.length}`);
  return itemAt(items, 0);
}

/** The item at `index`, failing the test when the list is shorter. */
export function itemAt<T>(items: readonly T[], index: number): T {
  assert(
    Number.isInteger(index) && index >= 0 && index < items.length,
    `no item at ${index} of ${items.length}`,
  );
  // In range, so this is an item of the list, even an undefined one.
  return items[index] as T;
}
