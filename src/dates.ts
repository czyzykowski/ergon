/**
 * A day, as every ergon flag that takes one spells it — `--due`, `--since`,
 * `--date`. One shape across the CLI, and one place that knows it.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(value: string): boolean {
  return DATE_PATTERN.test(value.trim());
}

/** Today in the operator's own timezone, which is the day they mean. */
export function today(): string {
  return localDay(new Date());
}

/** The day an instant falls on in the operator's own timezone. */
export function localDay(instant: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");

  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${
    pad(instant.getDate())
  }`;
}
