/**
 * The refusal [ADR 0003](../docs/adr/0003-descriptions-are-plain-text.md) asks
 * for, in one place now that two fields need it.
 *
 * ergon writes plain paragraphs, so rewriting a document holding anything
 * richer destroys it — and Jira keeps no field-level undo. The guard is the
 * same for a Description and for a Comment; only the noun and the flag change.
 */

import { unsupportedAdfNodes } from "./adf.ts";

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
 * Throws when `doc` holds anything ergon cannot reproduce, naming what it
 * found. `--force` waives that, but only for a replacement written by hand:
 * prefilling an editor from a document ergon cannot render faithfully means
 * amending a corrupted copy without being able to see what was already lost.
 */
export function assertRewritable(guard: RewriteGuard): void {
  const lost = unsupportedAdfNodes(guard.doc);

  if (lost.length === 0) return;

  if (!guard.supplied) {
    throw new Error(
      `${guard.subject} contains ${
        lost.join(", ")
      }, which ergon cannot edit in place. ` +
        `Pass ${guard.flag} --force to replace it outright, or edit it in Jira.`,
    );
  }

  if (!guard.force) {
    throw new Error(
      `${guard.subject} contains ${lost.join(", ")}, which would be lost. ` +
        `Pass --force to replace it with plain text.`,
    );
  }
}
