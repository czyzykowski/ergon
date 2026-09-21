/**
 * The refusal [ADR 0010](../docs/adr/0010-markdown-is-ergons-rich-text-format.md)
 * keeps from [ADR 0003](../docs/adr/0003-descriptions-are-plain-text.md), in
 * one place now that two fields need it.
 *
 * A Replacement overwrites content ergon did not write, and Jira keeps no
 * field-level undo, so a document ergon cannot reproduce is refused rather
 * than flattened. The guard is the same for a Description and for a Comment;
 * only the noun and the flag change.
 */

import { canReplace } from "./adf.ts";

export interface RewriteGuard {
  /** Names what is being rewritten: `PCK-12's description`. */
  subject: string;
  /** The document as Jira holds it. */
  doc: unknown;
  /** Whether a replacement was written by hand rather than in the editor. */
  supplied: boolean;
  force: boolean;
  /** The flag carrying a replacement, named in the way out. */
  flag: string;
}

/**
 * Throws when rendering `doc` to markdown and parsing it back would not yield
 * `doc` again, naming what stood in the way. `--force` waives that, but only
 * for a replacement written by hand: prefilling an editor from a document
 * ergon cannot render faithfully means amending a corrupted copy without being
 * able to see what was already lost.
 */
export function assertRewritable(guard: RewriteGuard): void {
  const { ok, differences } = canReplace(guard.doc);

  if (ok) return;

  const lost = differences.join(", ");

  if (!guard.supplied) {
    throw new Error(
      `${guard.subject} contains ${lost}, which ergon cannot edit in place. ` +
        `Pass ${guard.flag} --force to replace it outright, or edit it in Jira.`,
    );
  }

  if (!guard.force) {
    throw new Error(
      `${guard.subject} contains ${lost}, which would be lost. ` +
        `Pass --force to replace it anyway.`,
    );
  }
}
