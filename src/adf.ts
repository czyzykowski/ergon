/**
 * Atlassian Document Format, and markdown, which is how ergon writes it.
 *
 * Jira Cloud REST v3 holds rich-text fields as ADF rather than plain strings.
 * ergon treats every one of them as markdown in both directions — see
 * [ADR 0010](../docs/adr/0010-markdown-is-ergons-rich-text-format.md).
 *
 * The two directions are defined against one set of constructs, the Expressible
 * set: `renderAdf` emits a construct without reporting it Degraded exactly when
 * `toAdf` can write that construct back. Markdown outside the set is refused
 * rather than approximated, and a document outside it cannot be replaced.
 *
 * Parsing is bought, mapping is built. `mdast-util-from-markdown` does inline
 * emphasis nesting, lazy list continuation and CommonMark's whitespace rules,
 * which is where a hand-rolled parser goes quietly wrong; the mapping between
 * the parsed tree and ADF is ergon's own, and sits next to its inverse so the
 * two can be read against each other.
 */

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

interface AdfNode {
  type?: unknown;
  version?: unknown;
  text?: unknown;
  content?: unknown;
  marks?: unknown;
  attrs?: unknown;
}

/** As much of an mdast tree as the mapping reads. */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  url?: string;
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  lang?: string | null;
  align?: Array<string | null | undefined>;
}

/** A field read out: the markdown, and what lost its shape getting there. */
export interface RenderedMarkdown {
  text: string;
  /** Node and mark types whose structure `renderAdf` could not reproduce. */
  degraded: string[];
}

/**
 * Markdown ergon cannot write to Jira, naming the construct that stopped it.
 *
 * There is no override. The markdown being refused is the caller's own draft,
 * still in hand and trivially rewritten, so there is nothing to force past —
 * which is what distinguishes this from the Replacement guard, where the
 * content at risk belongs to someone else.
 */
export class UnexpressibleError extends Error {
  /** The construct, as a noun phrase: `an image`. */
  readonly construct: string;

  constructor(
    construct: string,
    reason: string,
    remedy = "Rewrite the markdown without it.",
  ) {
    super(`ergon cannot write ${construct}. ${reason} ${remedy}`);
    this.name = "UnexpressibleError";
    this.construct = construct;
  }
}

/**
 * Parse markdown into ADF. Throws `UnexpressibleError` for anything outside the
 * Expressible set rather than dropping it — ADR 0004's rule, applied to the
 * direction that destroys things.
 */
export function toAdf(markdown: string): Record<string, unknown> {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as unknown as MdNode;

  let tasks = 0;

  return identify({
    type: "doc",
    version: 1,
    content: blocksFrom(tree.children ?? [], "doc"),
  }, () => `ergon-task-${tasks += 1}`) as Record<string, unknown>;
}

/**
 * Jira mints a `localId` for a task itself, but its validator wants one
 * present, so the write side supplies one. Nothing reads it — the guard strips
 * it as Jira-minted identity.
 */
function identify(node: AdfNode, next: () => string): AdfNode {
  const type = typeString(node);
  const children = childrenOf(node);

  if (children.length === 0 && type !== "taskList" && type !== "taskItem") {
    return node;
  }

  const identified = type === "taskList" || type === "taskItem"
    ? { ...node, attrs: { ...attrsOf(node), localId: next() } }
    : node;

  return Array.isArray(node.content)
    ? { ...identified, content: children.map((child) => identify(child, next)) }
    : identified;
}

/**
 * The markdown constructs with no ADF to be written to, and why. Everything
 * else mdast produces is Expressible; a type missing from here and missing
 * from the mapping is one this module has never seen.
 */
const NO_ADF_FOR: Record<string, { noun: string; reason: string }> = {
  definition: {
    noun: "a link definition",
    reason: "Jira has no reference-style links; write the link inline.",
  },
  footnoteDefinition: { noun: "a footnote", reason: "Jira has no footnotes." },
  footnoteReference: {
    noun: "a footnote reference",
    reason: "Jira has no footnotes.",
  },
  html: { noun: "raw HTML", reason: "Jira has no raw HTML." },
  image: {
    noun: "an image",
    reason:
      "Jira addresses an attachment by id, which markdown has no way to name.",
  },
  imageReference: {
    noun: "an image reference",
    reason:
      "Jira addresses an attachment by id, which markdown has no way to name.",
  },
  linkReference: {
    noun: "a link reference",
    reason: "Jira has no reference-style links; write the link inline.",
  },
  yaml: {
    noun: "front matter",
    reason: "Jira has nowhere to put front matter.",
  },
};

function refuse(node: MdNode): never {
  const known = NO_ADF_FOR[node.type];

  throw new UnexpressibleError(
    known?.noun ?? `a \`${node.type}\` node`,
    known?.reason ?? "ADF has nothing to write it as.",
  );
}

/**
 * What ADF lets each container hold. Markdown is happy to nest anything in
 * anything; ADF's schema is not, and a document that breaks it comes back from
 * Jira as a 400 that says nothing about which part was wrong.
 */
const CONTAINERS: Record<string, { allows: Set<string>; holds: string }> = {
  doc: {
    allows: new Set([
      "paragraph",
      "heading",
      "bulletList",
      "orderedList",
      "taskList",
      "blockquote",
      "rule",
      "codeBlock",
      "table",
    ]),
    holds: "A Jira document holds a block, not this.",
  },
  listItem: {
    allows: new Set(["paragraph", "bulletList", "orderedList", "codeBlock"]),
    holds: "A Jira list item holds a paragraph, a list or a code block.",
  },
  blockquote: {
    allows: new Set(["paragraph", "bulletList", "orderedList", "codeBlock"]),
    holds: "A Jira quote holds a paragraph, a list or a code block.",
  },
};

function blocksFrom(nodes: MdNode[], parent: string): AdfNode[] {
  const container = CONTAINERS[parent];

  return nodes.map((node) => {
    const block = blockFrom(node);

    if (!container.allows.has(typeString(block))) {
      throw new UnexpressibleError(
        `${nounOf(typeString(block))} inside ${nounOf(parent)}`,
        container.holds,
        "Move it out.",
      );
    }

    return block;
  });
}

function blockFrom(node: MdNode): AdfNode {
  switch (node.type) {
    case "paragraph":
      return { type: "paragraph", content: inlineFrom(node.children ?? []) };

    case "heading":
      return {
        type: "heading",
        attrs: { level: Math.min(Math.max(node.depth ?? 1, 1), 6) },
        content: inlineFrom(node.children ?? []),
      };

    case "blockquote":
      return {
        type: "blockquote",
        content: blocksFrom(node.children ?? [], "blockquote"),
      };

    case "thematicBreak":
      return { type: "rule" };

    case "code":
      return {
        type: "codeBlock",
        ...(node.lang ? { attrs: { language: node.lang } } : {}),
        content: node.value ? [{ type: "text", text: node.value }] : [],
      };

    case "list":
      return listFrom(node);

    case "table":
      return tableFrom(node);

    default:
      refuse(node);
  }
}

/**
 * The first row of a GFM table is its header row, which is the only shape GFM
 * has. A Jira table with no header row is therefore readable but not writable.
 */
function tableFrom(node: MdNode): AdfNode {
  if ((node.align ?? []).some((alignment) => alignment)) {
    throw new UnexpressibleError(
      "a column alignment",
      "A Jira table has no per-column alignment.",
    );
  }

  return {
    // Jira writes these out on every table it authors, and they are the
    // defaults, so emitting them is what lets an ordinary Jira table be
    // rewritten. A table laid out any other way still differs, and is refused.
    attrs: { isNumberColumnEnabled: false, layout: "default" },
    type: "table",
    content: (node.children ?? []).map((row, index) => ({
      type: "tableRow",
      content: (row.children ?? []).map((cell) => ({
        type: index === 0 ? "tableHeader" : "tableCell",
        content: [{
          type: "paragraph",
          content: inlineFrom(cell.children ?? []),
        }],
      })),
    })),
  };
}

function listFrom(node: MdNode): AdfNode {
  const items = node.children ?? [];
  const ticked = items.filter((item) => typeof item.checked === "boolean");

  if (ticked.length === items.length && items.length > 0) {
    return taskListFrom(items);
  }

  if (ticked.length > 0) {
    throw new UnexpressibleError(
      "a list that is only partly a checklist",
      "A Jira task list is all tasks or none.",
    );
  }

  return {
    type: node.ordered ? "orderedList" : "bulletList",
    ...(node.ordered ? { attrs: { order: node.start ?? 1 } } : {}),
    content: items.map((item) => ({
      type: "listItem",
      content: blocksFrom(item.children ?? [], "listItem"),
    })),
  };
}

function taskListFrom(items: MdNode[]): AdfNode {
  return {
    type: "taskList",
    content: items.map((item) => ({
      type: "taskItem",
      attrs: { state: item.checked ? "DONE" : "TODO" },
      content: taskContentFrom(item),
    })),
  };
}

/** A Jira task is a single line; anything else in the item has nowhere to go. */
function taskContentFrom(item: MdNode): AdfNode[] {
  const blocks = item.children ?? [];

  if (blocks.length !== 1 || blocks[0].type !== "paragraph") {
    throw new UnexpressibleError(
      "a block inside a task",
      "A Jira task holds one line of text.",
    );
  }

  return inlineFrom(blocks[0].children ?? []);
}

function inlineFrom(nodes: MdNode[], marks: AdfNode[] = []): AdfNode[] {
  return nodes.flatMap((node) => inlineNodeFrom(node, marks));
}

function inlineNodeFrom(node: MdNode, marks: AdfNode[]): AdfNode[] {
  switch (node.type) {
    // ADF has no soft break, so a wrapped line becomes an explicit one. This
    // is the canonicalisation the semantic guarantee allows for.
    case "text":
      return textNodes(node.value ?? "", marks);

    case "break":
      return [{ type: "hardBreak" }];

    case "inlineCode":
      return node.value
        ? [textNode(node.value, [...marks, { type: "code" }])]
        : [];

    case "strong":
      return inlineFrom(node.children ?? [], [...marks, { type: "strong" }]);

    case "emphasis":
      return inlineFrom(node.children ?? [], [...marks, { type: "em" }]);

    case "delete":
      return inlineFrom(node.children ?? [], [...marks, { type: "strike" }]);

    case "link":
      return inlineFrom(node.children ?? [], [
        ...marks,
        { type: "link", attrs: { href: node.url ?? "" } },
      ]);

    default:
      refuse(node);
  }
}

function textNodes(value: string, marks: AdfNode[]): AdfNode[] {
  return value
    .split("\n")
    .flatMap((line, index) => [
      ...(index > 0 ? [{ type: "hardBreak" }] : []),
      ...(line.length > 0 ? [textNode(line, marks)] : []),
    ]);
}

function textNode(text: string, marks: AdfNode[]): AdfNode {
  return marks.length > 0
    ? { type: "text", text, marks: [...marks] }
    : { type: "text", text };
}

/**
 * Read any document out as markdown. The rule is that content never disappears
 * quietly: a construct outside the Expressible set still has its text emitted,
 * and its type named in `degraded`. A caller is never handed a blank body
 * without being told why.
 *
 * The output is markdown a parser can read back, which is what makes `toAdf`
 * its inverse over the Expressible set.
 */
export function renderAdf(doc: unknown): RenderedMarkdown {
  if (!isNode(doc)) return { text: "", degraded: [] };

  const degraded = new Set<string>();
  const text = renderBlocks(childrenOf(doc), degraded);

  return { text, degraded: [...degraded].sort() };
}

/** Inline types, which decide whether a container holds prose or blocks. */
const INLINE_NODES = new Set([
  "text",
  "hardBreak",
  "mention",
  "emoji",
  "inlineCard",
  "date",
  "status",
]);

/** Marks markdown wraps, innermost first so `**bold**` nests inside a link. */
const MARK_WRAPPERS: Array<[string, string]> = [
  ["strike", "~~"],
  ["em", "*"],
  ["strong", "**"],
];

/** Marks markdown carries by some other means than a wrapper. */
const CARRIED_MARKS = new Set(["code", "link"]);

/**
 * Blocks separate with a blank line. Under CommonMark two paragraphs separated
 * by a single newline are one paragraph with a soft break, so the separator
 * ADR 0004 chose is lossy the moment anything parses the output.
 */
function renderBlocks(nodes: AdfNode[], degraded: Set<string>): string {
  let previous: string | undefined;

  return nodes
    .filter((node) => !isBlankParagraph(node))
    .map((node) => {
      const marker = markerOf(node);
      // Two lists written one after the other under the same marker are one
      // list when read back. CommonMark starts a new list at a new marker, so
      // neighbours take turns: `-` then `*`, `1.` then `1)`.
      const alternate = marker !== undefined && previous === marker;

      previous = marker === undefined
        ? undefined
        : alternate
        ? otherMarker(marker)
        : marker;

      return renderBlock(node, degraded, alternate);
    })
    .join("\n\n");
}

/** The character a list writes its items with, or nothing for a non-list. */
function markerOf(node: AdfNode): string | undefined {
  switch (typeString(node)) {
    case "bulletList":
    case "taskList":
      return "-";
    case "orderedList":
      return ".";
    default:
      return undefined;
  }
}

function otherMarker(marker: string): string {
  return marker === "-" ? "*" : ")";
}

/**
 * A paragraph with nothing in it is vertical whitespace rather than content,
 * and markdown has no way to spell one — blank lines are separators. So it is
 * dropped on both sides rather than refused, which would put every Description
 * written in the Jira UI with a blank line in it out of reach.
 */
function isBlankParagraph(node: AdfNode): boolean {
  return typeString(node) === "paragraph" &&
    childrenOf(node).every((child) =>
      typeString(child) === "text" && child.text === ""
    );
}

function renderBlock(
  node: AdfNode,
  degraded: Set<string>,
  alternate = false,
): string {
  const type = typeString(node);
  const children = childrenOf(node);
  const bullet = alternate ? "*" : "-";

  switch (type) {
    case "paragraph":
      return renderProse(children, degraded);

    case "heading": {
      const level = Math.min(Math.max(numberAttr(node, "level") ?? 1, 1), 6);
      // A run of hashes at the end of a heading closes it, so it is escaped.
      const text = renderInline(children, degraded).replace(
        /(^|\s)(#+)$/,
        "$1\\$2",
      );

      return `${"#".repeat(level)} ${text}`;
    }

    case "bulletList":
      return renderList(children, degraded, () => `${bullet} `);

    case "orderedList": {
      const start = numberAttr(node, "order") ?? 1;
      const dot = alternate ? ")" : ".";
      return renderList(
        children,
        degraded,
        (index) => `${start + index}${dot} `,
      );
    }

    case "taskList":
      return renderList(
        children,
        degraded,
        (_index, item) =>
          `${bullet} [${stringAttr(item, "state") === "DONE" ? "x" : " "}] `,
      );

    case "listItem":
    case "taskItem":
    case "decisionItem":
      return renderContainer(node, degraded);

    case "codeBlock": {
      const language = stringAttr(node, "language") ?? "";
      const body = rawText(children);
      const fence = "`".repeat(Math.max(3, longestRun(body, "`") + 1));
      return `${fence}${language}\n${body}\n${fence}`;
    }

    case "blockquote":
      return quote(renderBlocks(children, degraded));

    // A panel keeps its text and loses only which kind of panel it was.
    case "panel":
      degraded.add(type);
      return quote(renderBlocks(children, degraded));

    case "rule":
      return "---";

    case "table":
      return renderTable(children, degraded);

    case "mediaSingle":
    case "mediaGroup":
      return renderBlocks(children, degraded);

    // Attachments have no text of their own, so the name is all there is.
    case "media":
      degraded.add(type);
      return stringAttr(node, "alt") ?? stringAttr(node, "id") ?? "";

    case "expand":
    case "nestedExpand": {
      degraded.add(type);
      const title = stringAttr(node, "title");
      const body = renderBlocks(children, degraded);
      return title ? `${title}\n\n${body}` : body;
    }

    default:
      if (type) degraded.add(type);
      return renderContainer(node, degraded);
  }
}

/**
 * Prose that begins a line could be read back as some other block entirely —
 * a paragraph opening with `#` is a heading, a task reading `- x` is a list —
 * so every line of it is escaped where it would open one.
 */
function renderProse(children: AdfNode[], degraded: Set<string>): string {
  return renderInline(children, degraded)
    .split("\n")
    .map(escapeBlockStart)
    .join("\n");
}

/**
 * GFM has one table shape: a header row, a delimiter row, then the body. A
 * table Jira holds in any other shape keeps its text and says what it lost.
 */
function renderTable(rows: AdfNode[], degraded: Set<string>): string {
  const width = childrenOf(rows[0] ?? {}).length;

  if (width === 0) {
    degraded.add("table");
    return "";
  }

  if (!isPlainTable(rows)) degraded.add("table");

  const lines = rows.map((row) => renderTableRow(row, degraded));
  const delimiter = `| ${Array(width).fill("---").join(" | ")} |`;

  return [lines[0], delimiter, ...lines.slice(1)].join("\n");
}

/**
 * A table markdown can carry whole: a real header row, and every cell holding
 * at most one paragraph, since a cell is one line once it is written out.
 */
function isPlainTable(rows: AdfNode[]): boolean {
  const headers = childrenOf(rows[0] ?? {});

  return headers.every((cell) => typeString(cell) === "tableHeader") &&
    rows.every((row) => childrenOf(row).length === headers.length) &&
    rows.every((row) =>
      childrenOf(row).every((cell) => {
        const blocks = childrenOf(cell).filter((block) =>
          !isBlankParagraph(block)
        );

        return blocks.length <= 1 &&
          blocks.every((block) => typeString(block) === "paragraph");
      })
    );
}

/** A pipe inside a cell has to be escaped, or it ends the cell. */
function renderTableRow(row: AdfNode, degraded: Set<string>): string {
  const cells = childrenOf(row)
    .map((cell) =>
      renderBlocks(childrenOf(cell), degraded)
        .replace(/\n+/g, " ")
        .replace(/\|/g, "\\|")
    );

  return `| ${cells.join(" | ")} |`;
}

function renderList(
  items: AdfNode[],
  degraded: Set<string>,
  marker: (index: number, item: AdfNode) => string,
): string {
  return items
    .map((item, index) => {
      const bullet = marker(index, item);
      return indent(
        renderBlock(item, degraded),
        bullet,
        " ".repeat(bullet.length),
      );
    })
    .join("\n");
}

/**
 * Render a node's children without knowing whether it holds prose or blocks —
 * a `listItem` holds paragraphs, a `taskItem` holds text, and an unrecognised
 * node could hold either.
 */
function renderContainer(node: AdfNode, degraded: Set<string>): string {
  const children = childrenOf(node);

  if (children.length === 0) return fallbackText(node);

  const inline = children.some((child) => INLINE_NODES.has(typeString(child)));

  return inline
    ? renderProse(children, degraded)
    : renderBlocks(children, degraded);
}

/**
 * Jira splits a run of text as the cursor moves through it, so a bold word can
 * arrive as several nodes. Rendering each one separately would emit
 * `**on****e**`, which is not how anyone writes it and not what parses back.
 */
function renderInline(nodes: AdfNode[], degraded: Set<string>): string {
  return coalesce(nodes)
    .map((node) => renderInlineNode(node, degraded))
    .join("");
}

function renderInlineNode(node: AdfNode, degraded: Set<string>): string {
  const type = typeString(node);

  switch (type) {
    case "text":
      return renderText(node, degraded);

    // A bare newline is a soft break, which CommonMark folds back into a space.
    case "hardBreak":
      return "\\\n";

    // Read whole, but markdown has no way to name a Jira account, a Jira
    // emoji or a smart link, so none of them can be written back.
    case "mention":
      degraded.add(type);
      return stringAttr(node, "text") ?? "";

    case "emoji":
      degraded.add(type);
      return stringAttr(node, "text") ?? stringAttr(node, "shortName") ?? "";

    case "inlineCard":
      degraded.add(type);
      return stringAttr(node, "url") ?? "";

    default: {
      if (type) degraded.add(type);
      const children = childrenOf(node);
      return children.length > 0
        ? renderInline(children, degraded)
        : fallbackText(node);
    }
  }
}

function renderText(node: AdfNode, degraded: Set<string>): string {
  const raw = typeof node.text === "string" ? node.text : "";

  if (raw.length === 0) return "";

  const marks = Array.isArray(node.marks) ? node.marks.filter(isNode) : [];
  const names = marks
    .map((mark) => mark.type)
    .filter((type): type is string => typeof type === "string");

  let result = names.includes("code") ? codeSpan(raw) : escapeInline(raw);

  for (const [name, wrapper] of MARK_WRAPPERS) {
    if (names.includes(name)) result = `${wrapper}${result}${wrapper}`;
  }

  for (const name of names) {
    if (!CARRIED_MARKS.has(name) && !MARK_WRAPPERS.some(([m]) => m === name)) {
      degraded.add(name);
    }
  }

  const link = marks.find((mark) => mark.type === "link");
  const href = link ? stringAttr(link, "href") : undefined;

  return href ? `[${result}](${linkTarget(href)})` : result;
}

/**
 * The last thing a node has to say when it has no children — enough to keep a
 * lozenge, a date, or an unrecognised inline node from vanishing.
 */
function fallbackText(node: AdfNode): string {
  for (const name of ["text", "url", "shortName", "timestamp"]) {
    const value = stringAttr(node, name);
    if (value) return value;
  }

  return "";
}

function rawText(nodes: AdfNode[]): string {
  return nodes.map((node) => typeof node.text === "string" ? node.text : "")
    .join("");
}

/** A quote's blank lines need the marker too, or the quote ends at them. */
function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => line.length === 0 ? ">" : `> ${line}`)
    .join("\n");
}

function indent(text: string, first: string, rest: string): string {
  return text
    .split("\n")
    .map((line, index) => {
      if (index === 0) return `${first}${line}`;
      return line.length === 0 ? "" : `${rest}${line}`;
    })
    .join("\n");
}

/**
 * Backslash-escape the punctuation that would otherwise start an inline
 * construct. Escaping more than strictly necessary is safe — a backslash
 * before ASCII punctuation always renders as that punctuation — whereas
 * escaping too little changes what the text says when it is read back.
 */
function escapeInline(text: string): string {
  let out = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1] ?? "";

    if ("\\`*[]~".includes(char)) {
      out += `\\${char}`;
    } else if (char === "_" && !(isWord(text[index - 1]) && isWord(next))) {
      // Intraword underscores open nothing in CommonMark, so `snake_case`
      // stays readable.
      out += "\\_";
    } else if (char === "&" && /[0-9A-Za-z#]/.test(next)) {
      out += "\\&";
    } else if (char === "<" && /[0-9A-Za-z/!?]/.test(next)) {
      out += "\\<";
    } else {
      out += char;
    }
  }

  return out;
}

function isWord(char: string | undefined): boolean {
  return char !== undefined && /[0-9A-Za-z]/.test(char);
}

/** Escape a line that would otherwise open a block rather than continue one. */
function escapeBlockStart(line: string): string {
  const ordered = line.match(/^( {0,3})(\d{1,9})([.)])(?=[ \t]|$)/);

  if (ordered) {
    // `\1.` is not an escape — only punctuation escapes — so the dot takes it.
    return `${ordered[1]}${ordered[2]}\\${ordered[3]}${
      line.slice(ordered[0].length)
    }`;
  }

  const opener = line.match(
    /^( {0,3})(?:#{1,6}(?=[ \t]|$)|>|[-+](?=[ \t]|$)|=+[ \t]*$|-+[ \t]*$|\|)/,
  );

  return opener ? `${opener[1]}\\${line.slice(opener[1].length)}` : line;
}

function codeSpan(text: string): string {
  const fence = "`".repeat(longestRun(text, "`") + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";

  return `${fence}${pad}${text}${pad}${fence}`;
}

function longestRun(text: string, char: string): number {
  const runs = text.match(new RegExp(`\\${char}+`, "g")) ?? [];

  return Math.max(0, ...runs.map((run) => run.length));
}

/** A target with spaces or brackets in it needs the angle-bracket form. */
function linkTarget(href: string): string {
  return /[\s<>()]/.test(href)
    ? `<${href.replace(/([<>\\])/g, "\\$1")}>`
    : href;
}

function attrsOf(node: AdfNode): Record<string, unknown> {
  return isNode(node.attrs) ? node.attrs as Record<string, unknown> : {};
}

function stringAttr(node: AdfNode, name: string): string | undefined {
  const value = attrsOf(node)[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberAttr(node: AdfNode, name: string): number | undefined {
  const value = attrsOf(node)[name];
  return typeof value === "number" ? value : undefined;
}

function isNode(value: unknown): value is AdfNode {
  return typeof value === "object" && value !== null;
}

function childrenOf(node: AdfNode): AdfNode[] {
  return Array.isArray(node.content) ? node.content.filter(isNode) : [];
}

/** Whether a document can be overwritten, and what stands in the way. */
export interface ReplaceVerdict {
  ok: boolean;
  /** Noun phrases naming what ergon would not write back, sorted. */
  differences: string[];
}

/**
 * Whether rendering `doc` to markdown and parsing it back yields `doc` again.
 *
 * This is the Replacement guard, computed rather than tabulated. A list of node
 * types cannot answer it: a table with merged cells holds only Expressible node
 * types, so a type check waves it through and `colspan` vanishes with no undo.
 */
export function canReplace(doc: unknown): ReplaceVerdict {
  if (!isNode(doc)) return { ok: true, differences: [] };

  let produced: unknown;

  try {
    produced = toAdf(renderAdf(doc).text);
  } catch (error) {
    return {
      ok: false,
      differences: [
        error instanceof UnexpressibleError ? error.construct : "its content",
      ],
    };
  }

  const found = new Set<string>();
  compare(doc, produced as AdfNode, found);

  return { ok: found.size === 0, differences: [...found].sort() };
}

/** ADF types named the way a refusal should read. */
const ADF_NOUNS: Record<string, string> = {
  blockquote: "a quote",
  bulletList: "a bullet list",
  codeBlock: "a code block",
  date: "a date",
  doc: "the document",
  emoji: "an emoji",
  expand: "an expand",
  hardBreak: "a line break",
  heading: "a heading",
  inlineCard: "a link card",
  listItem: "a list item",
  media: "an attachment",
  mediaGroup: "an attachment",
  mediaSingle: "an attachment",
  mention: "a mention",
  nestedExpand: "an expand",
  orderedList: "a numbered list",
  panel: "a panel",
  paragraph: "a paragraph",
  rule: "a horizontal rule",
  status: "a status lozenge",
  table: "a table",
  tableCell: "a table cell",
  tableHeader: "a table header cell",
  tableRow: "a table row",
  taskItem: "a task",
  taskList: "a task list",
  text: "text",
};

/** Attributes worth a name of their own when they are what stands in the way. */
const ATTR_PHRASES: Record<string, string> = {
  background: "colour",
  colspan: "merged columns",
  colwidth: "set column width",
  panelType: "kind",
  rowspan: "merged rows",
};

/** Marks named the same way, since a mark is not a node. */
const MARK_NOUNS: Record<string, string> = {
  code: "inline code",
  em: "italic text",
  link: "a link",
  strike: "strikethrough",
  strong: "bold text",
  subsup: "superscript or subscript text",
  textColor: "coloured text",
  underline: "underlined text",
};

function nounOf(type: string): string {
  return ADF_NOUNS[type] ?? `a \`${type}\` node`;
}

function markNounOf(type: string): string {
  return MARK_NOUNS[type] ?? `a \`${type}\` mark`;
}

/**
 * Directional containment: the original may carry nothing `toAdf` would have
 * produced. Every attribute Atlassian adds in future is authored content until
 * proven otherwise, which is the safe default; a curated list of benign
 * attributes has the opposite one.
 */
function compare(
  original: AdfNode,
  produced: AdfNode | undefined,
  found: Set<string>,
): void {
  const type = typeString(original);

  if (produced === undefined) {
    found.add(`${nounOf(type)} ergon would not write back`);
    return;
  }

  const other = typeString(produced);

  if (type !== other) {
    found.add(
      `${nounOf(type)} (ergon would write it back as ${nounOf(other)})`,
    );
    return;
  }

  if (original.text !== produced.text) {
    found.add(`text inside ${nounOf(type)}`);
  }

  compareAttrs(original, produced, type, found);
  compareMarks(original, produced, found);

  const mine = coalesce(childrenOf(original));
  const theirs = coalesce(childrenOf(produced));

  if (mine.length !== theirs.length) {
    found.add(`what sits inside ${nounOf(type)}`);
  }

  for (
    let index = 0;
    index < Math.min(mine.length, theirs.length);
    index += 1
  ) {
    compare(mine[index], theirs[index], found);
  }
}

function compareAttrs(
  original: AdfNode,
  produced: AdfNode,
  type: string,
  found: Set<string>,
): void {
  const mine = attrsOf(original);
  const theirs = attrsOf(produced);

  for (const [name, value] of Object.entries(mine)) {
    // `localId` is minted by Jira rather than written by anyone. The rule is
    // about provenance, so it does not grow as the schema does.
    if (name === "localId") continue;

    // An attribute set to null holds nothing — Jira writes them out where the
    // schema has a default — so there is nothing there to lose.
    if (value === null || value === undefined) continue;

    if (!sameValue(value, theirs[name])) {
      const phrase = ATTR_PHRASES[name] ?? `\`${name}\``;
      found.add(`${nounOf(type)}'s ${phrase}`);
    }
  }
}

function compareMarks(
  original: AdfNode,
  produced: AdfNode,
  found: Set<string>,
): void {
  const theirs = marksOf(produced);

  for (const mark of marksOf(original)) {
    const type = typeString(mark);
    const match = theirs.find((other) => typeString(other) === type);

    if (!match) {
      found.add(markNounOf(type));
      continue;
    }

    for (const [name, value] of Object.entries(attrsOf(mark))) {
      if (!sameValue(value, attrsOf(match)[name])) {
        found.add(`${markNounOf(type)}'s \`${name}\``);
      }
    }
  }
}

/** Jira may split a run of text that `toAdf` emits whole. */
function coalesce(nodes: AdfNode[]): AdfNode[] {
  const out: AdfNode[] = [];

  for (const node of nodes.filter((child) => !isBlankParagraph(child))) {
    const last = out[out.length - 1];

    if (
      last && typeString(node) === "text" && typeString(last) === "text" &&
      sameMarks(last, node)
    ) {
      out[out.length - 1] = {
        ...last,
        text: `${last.text ?? ""}${node.text ?? ""}`,
      };
      continue;
    }

    out.push(node);
  }

  return out;
}

function sameMarks(a: AdfNode, b: AdfNode): boolean {
  return sameValue(markKey(a), markKey(b));
}

/** Marks compare without regard to order, so they sort before comparison. */
function markKey(node: AdfNode): string {
  return marksOf(node)
    .map((mark) => JSON.stringify([typeString(mark), sortedAttrs(mark)]))
    .sort()
    .join("|");
}

function sortedAttrs(node: AdfNode): Array<[string, unknown]> {
  return Object.entries(attrsOf(node)).sort(([a], [b]) => a < b ? -1 : 1);
}

function marksOf(node: AdfNode): AdfNode[] {
  return Array.isArray(node.marks) ? node.marks.filter(isNode) : [];
}

function typeString(node: AdfNode): string {
  return typeof node.type === "string" ? node.type : "";
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  if (isNode(a) && isNode(b)) {
    const keys = Object.keys(a as Record<string, unknown>);
    const others = Object.keys(b as Record<string, unknown>);
    return keys.length === others.length && keys.every((key) =>
      sameValue(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )
    );
  }
  return false;
}
