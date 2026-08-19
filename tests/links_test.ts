import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  BLOCKED_BY,
  createLinkBody,
  DUPLICATES,
  findLink,
  renderLinks,
} from "../src/links.ts";
import type { JiraIssueLink } from "../src/links.ts";

const BLOCKS = { name: "Blocks", inward: "is blocked by", outward: "blocks" };
const DUPLICATE = {
  name: "Duplicate",
  inward: "is duplicated by",
  outward: "duplicates",
};
const RELATES = {
  name: "Relates",
  inward: "relates to",
  outward: "relates to",
};

function counterpart(key: string, summary: string, status: string) {
  return { key, fields: { summary, status: { name: status } } };
}

/** The subject reads with the inward Phrase: "subject is blocked by PCK-2". */
const INWARD_BLOCKS: JiraIssueLink = {
  id: "1",
  type: BLOCKS,
  inwardIssue: counterpart("PCK-2", "Pin the runner image", "Done"),
};

/** The subject reads with the outward Phrase: "subject blocks PCK-3". */
const OUTWARD_BLOCKS: JiraIssueLink = {
  id: "2",
  type: BLOCKS,
  outwardIssue: counterpart("PCK-3", "Ship the release", "To Do"),
};

Deno.test("a counterpart in inwardIssue reads with the inward phrase", () => {
  assertEquals(renderLinks([INWARD_BLOCKS]), [{
    id: "1",
    phrase: "is blocked by",
    key: "PCK-2",
    summary: "Pin the runner image",
    status: "Done",
  }]);
});

Deno.test("a counterpart in outwardIssue reads with the outward phrase", () => {
  assertEquals(renderLinks([OUTWARD_BLOCKS]), [{
    id: "2",
    phrase: "blocks",
    key: "PCK-3",
    summary: "Ship the release",
    status: "To Do",
  }]);
});

Deno.test("a symmetric type reads the same either way", () => {
  const [inward] = renderLinks([
    { id: "3", type: RELATES, inwardIssue: counterpart("PCK-4", "A", "To Do") },
  ]);
  const [outward] = renderLinks([
    {
      id: "4",
      type: RELATES,
      outwardIssue: counterpart("PCK-4", "A", "To Do"),
    },
  ]);

  assertEquals(inward.phrase, "relates to");
  assertEquals(outward.phrase, "relates to");
});

Deno.test("links keep the order Jira reported them in", () => {
  const rendered = renderLinks([OUTWARD_BLOCKS, INWARD_BLOCKS]);

  assertEquals(rendered.map((link) => link.key), ["PCK-3", "PCK-2"]);
});

Deno.test("an absent issuelinks field reads as no links", () => {
  assertEquals(renderLinks(undefined), []);
});

Deno.test("a link missing both ends is dropped, not half-rendered", () => {
  assertEquals(renderLinks([{ id: "5", type: BLOCKS }]), []);
});

Deno.test("blocked-by matches only the inward end", () => {
  assertEquals(findLink([INWARD_BLOCKS], BLOCKED_BY, "PCK-2")?.id, "1");
  // PCK-3 is on the outward end, so the subject blocks it rather than the other
  // way round — the wrong direction must not match.
  assertEquals(findLink([OUTWARD_BLOCKS], BLOCKED_BY, "PCK-3"), undefined);
});

Deno.test("duplicates matches only the outward end", () => {
  const links: JiraIssueLink[] = [
    {
      id: "6",
      type: DUPLICATE,
      outwardIssue: counterpart("PCK-9", "A", "Done"),
    },
    {
      id: "7",
      type: DUPLICATE,
      inwardIssue: counterpart("PCK-8", "B", "Done"),
    },
  ];

  assertEquals(findLink(links, DUPLICATES, "PCK-9")?.id, "6");
  assertEquals(findLink(links, DUPLICATES, "PCK-8"), undefined);
});

Deno.test("matching ignores the link type it was not asked about", () => {
  assertEquals(findLink([INWARD_BLOCKS], DUPLICATES, "PCK-2"), undefined);
});

Deno.test("matching a key ignores case", () => {
  assertEquals(findLink([INWARD_BLOCKS], BLOCKED_BY, "pck-2")?.id, "1");
});

Deno.test("blocked-by sends the subject as the outward issue", () => {
  // Jira's inwardIssue is the end reading with the *outward* phrase, so
  // "PCK-1 is blocked by PCK-2" is stored as "PCK-2 blocks PCK-1".
  assertEquals(createLinkBody(BLOCKED_BY, "PCK-1", "PCK-2"), {
    type: { name: "Blocks" },
    inwardIssue: { key: "PCK-2" },
    outwardIssue: { key: "PCK-1" },
  });
});

Deno.test("duplicates sends the subject as the inward issue", () => {
  assertEquals(createLinkBody(DUPLICATES, "PCK-1", "PCK-2"), {
    type: { name: "Duplicate" },
    inwardIssue: { key: "PCK-1" },
    outwardIssue: { key: "PCK-2" },
  });
});
