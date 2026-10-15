/**
 * `YYYY-MM-DD HH:MM`, sliced out of Jira's own string rather than parsed. The
 * timestamp already carries the offset it was written at, so reading it back
 * as a Date would only re-render it in whatever zone the terminal is in.
 */
export function timestamp(value: string): string {
  return `${value.slice(0, 10)} ${value.slice(11, 16)}`.trim();
}
