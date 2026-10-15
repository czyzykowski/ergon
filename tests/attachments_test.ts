import { assertEquals, assertThrows } from "testing/asserts.ts";
import { mapAttachment } from "../src/api/jira.ts";
import type { JiraAttachmentResponse } from "../src/api/jira.ts";
import {
  renderAttachments,
  selectAttachments,
} from "../src/commands/attachments.ts";

const SCREENSHOT: JiraAttachmentResponse = {
  id: "10423",
  filename: "checkout-error.png",
  author: { displayName: "Jane Doe" },
  created: "2026-10-02T14:11:07.000+0200",
  size: 48213,
  mimeType: "image/png",
  content: "https://example.atlassian.net/rest/api/3/attachment/content/10423",
  thumbnail:
    "https://example.atlassian.net/rest/api/3/attachment/thumbnail/10423",
};

Deno.test("an attachment maps to the contract and drops Jira's URLs", () => {
  assertEquals(mapAttachment(SCREENSHOT), {
    id: "10423",
    filename: "checkout-error.png",
    mimeType: "image/png",
    size: 48213,
    created: "2026-10-02T14:11:07.000+0200",
    author: "Jane Doe",
  });
});

Deno.test("an author Jira hides is Absent, not null or empty", () => {
  const mapped = mapAttachment({ ...SCREENSHOT, author: undefined });

  assertEquals("author" in mapped, false);
});

Deno.test("the mapper never sets a path", () => {
  assertEquals("path" in mapAttachment(SCREENSHOT), false);
});

Deno.test("each attachment is one line with the filename last, spaces and all", () => {
  const log = mapAttachment({
    ...SCREENSHOT,
    id: "10424",
    filename: "server log 2026-10-02.txt",
    size: 512,
    created: "2026-10-02T14:30:00.000+0200",
    mimeType: "text/plain",
  });

  assertEquals(
    renderAttachments([mapAttachment(SCREENSHOT), log]),
    [
      "10423  47 KB  2026-10-02 14:11  Jane Doe  checkout-error.png",
      "10424  512 B  2026-10-02 14:30  Jane Doe  server log 2026-10-02.txt",
    ].join("\n"),
  );
});

Deno.test("sizes round to B, KB or MB in base 1024", () => {
  const sizeOf = (size: number) =>
    renderAttachments([mapAttachment({ ...SCREENSHOT, size })]).split("  ")[1];

  assertEquals(
    [0, 1023, 1024, 1535, 1536, 1048064, 1048576, 188_743_680].map(sizeOf),
    [
      "0 B",
      "1023 B",
      "1 KB",
      "1 KB",
      "2 KB",
      "1 MB",
      "1 MB",
      "180 MB",
    ],
  );
});

Deno.test("an issue with nothing attached says so", () => {
  assertEquals(renderAttachments([]), "No attachments found.");
});

Deno.test("the timestamp is Jira's own wall time, not the terminal's", () => {
  const late = mapAttachment({
    ...SCREENSHOT,
    created: "2026-10-02T23:59:41.000-0700",
  });

  assertEquals(
    renderAttachments([late]).split("  ")[2],
    "2026-10-02 23:59",
  );
});

Deno.test("an attachment with a hidden author still renders, its column empty", () => {
  const anonymous = mapAttachment({ ...SCREENSHOT, author: undefined });

  assertEquals(
    renderAttachments([anonymous]),
    "10423  47 KB  2026-10-02 14:11    checkout-error.png",
  );
});

const ATTACHED = [
  mapAttachment(SCREENSHOT),
  mapAttachment({ ...SCREENSHOT, id: "10424", filename: "server.log" }),
  mapAttachment({ ...SCREENSHOT, id: "10425", filename: "recording.mp4" }),
];

const idsOf = (rows: { id: string }[]) => rows.map((row) => row.id);

Deno.test("no ids selects every attachment, in Jira's order", () => {
  assertEquals(idsOf(selectAttachments(ATTACHED, [])), [
    "10423",
    "10424",
    "10425",
  ]);
});

Deno.test("ids narrow the selection and keep Jira's order, not the typed one", () => {
  assertEquals(idsOf(selectAttachments(ATTACHED, ["10425", "10423"])), [
    "10423",
    "10425",
  ]);
});

Deno.test("an id not on the issue refuses the selection, naming it", () => {
  assertThrows(
    () => selectAttachments(ATTACHED, ["10423", "99999"]),
    Error,
    "Not attached to this issue: 99999.",
  );
});

Deno.test("the refusal names every unknown id, so one fix covers them all", () => {
  assertThrows(
    () => selectAttachments(ATTACHED, ["88888", "10424", "99999"]),
    Error,
    "Not attached to this issue: 88888, 99999.",
  );
});
