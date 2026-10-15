import { join } from "path/mod.ts";
import { assertEquals, assertRejects, assertThrows } from "testing/asserts.ts";
import { mapAttachment } from "../src/api/jira.ts";
import type { JiraAttachmentResponse } from "../src/api/jira.ts";
import {
  downloadAttachments,
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
};

Deno.test("an attachment maps to the contract", () => {
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

Deno.test("only a downloaded row ends with an arrow to its path", () => {
  const downloaded = {
    ...mapAttachment(SCREENSHOT),
    path: "/work/att/10423-checkout-error.png",
  };
  const listed = mapAttachment({
    ...SCREENSHOT,
    id: "10424",
    filename: "server.log",
  });

  assertEquals(
    renderAttachments([downloaded, listed]),
    [
      "10423  47 KB  2026-10-02 14:11  Jane Doe  checkout-error.png  → /work/att/10423-checkout-error.png",
      "10424  47 KB  2026-10-02 14:11  Jane Doe  server.log",
    ].join("\n"),
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

Deno.test("a dir gives each row its absolute path, named by id and filename", () => {
  assertEquals(
    selectAttachments(ATTACHED, ["10424"], "/work/att").map((row) => row.path),
    ["/work/att/10424-server.log"],
  );
});

Deno.test("a filename reduces to a safe basename that never leaves the dir", () => {
  const named = (id: string, filename: string) =>
    mapAttachment({ ...SCREENSHOT, id, filename });
  const hostile = [
    named("1", "a/b.png"),
    named("2", "../../etc/passwd"),
    named("3", "C:\\Users\\jane\\shot.png"),
    named("4", ""),
    named("5", ".."),
    named("6", "logs/"),
  ];

  const paths = selectAttachments(hostile, [], "/work/att").map((row) =>
    row.path
  );

  assertEquals(paths, [
    "/work/att/1-b.png",
    "/work/att/2-passwd",
    "/work/att/3-shot.png",
    "/work/att/4-attachment",
    "/work/att/5-attachment",
    "/work/att/6-attachment",
  ]);
});

Deno.test("two attachments sharing a filename land at distinct paths", () => {
  const twins = [
    mapAttachment({ ...SCREENSHOT, id: "10423", filename: "screenshot.png" }),
    mapAttachment({ ...SCREENSHOT, id: "10430", filename: "screenshot.png" }),
  ];

  assertEquals(
    selectAttachments(twins, [], "/work/att").map((row) => row.path),
    ["/work/att/10423-screenshot.png", "/work/att/10430-screenshot.png"],
  );
});

Deno.test("the unsanitized filename survives beside the safe path", () => {
  const [row] = selectAttachments(
    [mapAttachment({ ...SCREENSHOT, filename: "../../etc/passwd" })],
    [],
    "/work/att",
  );

  assertEquals(row.filename, "../../etc/passwd");
});

Deno.test("without a dir no row has a path", () => {
  assertEquals(
    selectAttachments(ATTACHED, []).some((row) => "path" in row),
    false,
  );
});

Deno.test("a relative dir still gives an absolute path", () => {
  const [row] = selectAttachments(ATTACHED, ["10423"], "att");

  assertEquals(row.path, join(Deno.cwd(), "att", "10423-checkout-error.png"));
});

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** The file name `filename` downloads to, as attachment 10423. */
const downloadName = (filename: string) =>
  selectAttachments([mapAttachment({ ...SCREENSHOT, filename })], [], "/att")[0]
    .path.slice("/att/".length);

Deno.test("a long filename is cut to 200 bytes, keeping its id and extension", () => {
  const name = downloadName(`${"a".repeat(300)}.png`);

  assertEquals(name, `10423-${"a".repeat(190)}.png`);
  assertEquals(byteLength(name), 200);
});

Deno.test("cutting counts UTF-8 bytes, not characters", () => {
  // Each "ż" is two bytes, so the 190 bytes left for the stem hold 95.
  assertEquals(
    downloadName(`${"ż".repeat(300)}.png`),
    `10423-${"ż".repeat(95)}.png`,
  );
});

Deno.test("a character that would straddle the cut is dropped whole", () => {
  // 189 one-byte characters leave one byte, too few for the four-byte emoji.
  assertEquals(
    downloadName(`${"a".repeat(189)}😀${"b".repeat(50)}.png`),
    `10423-${"a".repeat(189)}.png`,
  );
});

Deno.test("a filename that fits is left whole", () => {
  const filename = `${"a".repeat(190)}.png`;

  assertEquals(downloadName(filename), `10423-${filename}`);
});

Deno.test("NUL and other control characters are stripped from the name", () => {
  assertEquals(
    downloadName("re\u0000port\n\t\u001b[31m\u007f\u0085.pdf"),
    "10423-report[31m.pdf",
  );
});

Deno.test("a name of nothing but control characters falls back", () => {
  assertEquals(downloadName("\u0000\r\n"), "10423-attachment");
});

const BYTES: Record<string, Uint8Array> = {
  "10423": new TextEncoder().encode("png bytes"),
  "10424": new TextEncoder().encode("log bytes"),
  "10425": new TextEncoder().encode("mp4 bytes"),
};

const fromJira = (id: string) => Promise.resolve(BYTES[id]);

async function inTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir();
  try {
    await run(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

const readText = async (path: string) =>
  new TextDecoder().decode(await Deno.readFile(path));

async function entriesOf(dir: string): Promise<string[]> {
  const names = [];
  for await (const entry of Deno.readDir(dir)) names.push(entry.name);
  return names.sort();
}

Deno.test("downloads land at the selected paths, creating a missing dir", async () => {
  await inTempDir(async (root) => {
    const dir = join(root, "nested", "att");
    const rows = selectAttachments(ATTACHED, ["10423", "10424"], dir);

    await downloadAttachments(rows, fromJira);

    assertEquals(await entriesOf(dir), [
      "10423-checkout-error.png",
      "10424-server.log",
    ]);
    assertEquals(await readText(rows[0].path), "png bytes");
    assertEquals(await readText(rows[1].path), "log bytes");
  });
});

Deno.test("a download overwrites a file already at its path", async () => {
  await inTempDir(async (dir) => {
    const rows = selectAttachments(ATTACHED, ["10423"], dir);
    await Deno.writeTextFile(rows[0].path, "a stale partial run");

    await downloadAttachments(rows, fromJira);

    assertEquals(await readText(rows[0].path), "png bytes");
  });
});

Deno.test("a failed download leaves nothing under its name, temp or final", async () => {
  await inTempDir(async (dir) => {
    const rows = selectAttachments(ATTACHED, ["10423", "10424"], dir);
    const failOnLog = (id: string) =>
      id === "10424"
        ? Promise.reject(new Error("Jira API request failed (500)"))
        : fromJira(id);

    await assertRejects(
      () => downloadAttachments(rows, failOnLog),
      Error,
      "Jira API request failed (500)",
    );

    assertEquals(await entriesOf(dir), ["10423-checkout-error.png"]);
  });
});
