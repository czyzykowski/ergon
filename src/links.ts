import type { IssueLink } from "./types.ts";

/**
 * One element of Jira's `issuelinks` field. Jira describes a link from the
 * perspective of the issue it was read from: the counterpart sits in
 * `outwardIssue` when this issue reads with the type's outward Phrase, and in
 * `inwardIssue` when it reads with the inward one. Exactly one is present.
 */
export interface JiraIssueLink {
  id: string;
  type: { name: string; inward: string; outward: string };
  inwardIssue?: JiraLinkedIssue;
  outwardIssue?: JiraLinkedIssue;
}

interface JiraLinkedIssue {
  key: string;
  fields?: { summary?: string; status?: { name?: string } };
}

/** Which of a link type's two Phrases the subject reads with. */
export type Direction = "inward" | "outward";

/** A kind of Link ergon can write, named from the subject's side. */
export interface LinkKind {
  /** The Jira link type name, sent as-is on create. */
  typeName: string;
  /** The Phrase the subject reads with, which fixes the end it occupies. */
  direction: Direction;
  /** The subject's Phrase. */
  phrase: string;
  /** The Phrase reporting a Link that was already there. */
  alreadyPhrase: string;
  /** The Phrase reporting a Link that was never there. */
  absentPhrase: string;
}

export const BLOCKED_BY: LinkKind = {
  typeName: "Blocks",
  direction: "inward",
  phrase: "is blocked by",
  alreadyPhrase: "is already blocked by",
  absentPhrase: "is not blocked by",
};

export const DUPLICATES: LinkKind = {
  typeName: "Duplicate",
  direction: "outward",
  phrase: "duplicates",
  alreadyPhrase: "already duplicates",
  absentPhrase: "does not duplicate",
};

/** The issue's Links, in the order Jira reported them. */
export function renderLinks(links: JiraIssueLink[] | undefined): IssueLink[] {
  return (links ?? []).flatMap((link) => {
    const rendered = renderLink(link);

    return rendered ? [rendered] : [];
  });
}

function renderLink(link: JiraIssueLink): IssueLink | null {
  const outward = link.outwardIssue;
  const counterpart = outward ?? link.inwardIssue;

  if (!counterpart) return null;

  return {
    id: link.id,
    phrase: outward ? link.type.outward : link.type.inward,
    key: counterpart.key,
    summary: counterpart.fields?.summary ?? "",
    status: counterpart.fields?.status?.name ?? "",
  };
}

/**
 * The subject's existing Link of this kind to `targetKey`, if it has one. The
 * subject reads with the outward Phrase exactly when the counterpart sits in
 * `outwardIssue`, so the Direction picks which end to compare.
 */
export function findLink(
  links: JiraIssueLink[],
  kind: LinkKind,
  targetKey: string,
): JiraIssueLink | undefined {
  return links.find((link) => {
    if (link.type.name !== kind.typeName) return false;

    const counterpart = kind.direction === "outward"
      ? link.outwardIssue
      : link.inwardIssue;

    return counterpart?.key.toUpperCase() === targetKey.toUpperCase();
  });
}

/**
 * The body creating this Link. In Jira's two-ended record the `inwardIssue` is
 * the end that reads with the type's _outward_ Phrase — the field names are
 * inverted from what they suggest, so a subject reading inward is sent as the
 * `outwardIssue`. See NOTES.md.
 */
export function createLinkBody(
  kind: LinkKind,
  subjectKey: string,
  targetKey: string,
): Record<string, unknown> {
  const [inward, outward] = kind.direction === "outward"
    ? [subjectKey, targetKey]
    : [targetKey, subjectKey];

  return {
    type: { name: kind.typeName },
    inwardIssue: { key: inward },
    outwardIssue: { key: outward },
  };
}
