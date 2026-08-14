/**
 * Atlassian Document Format, as much of it as ergon speaks.
 *
 * Jira Cloud REST v3 requires rich-text fields as ADF rather than plain strings.
 * ergon writes exactly one shape of it — a document of paragraphs — so a
 * Description holding lists, code, or tables is one it cannot reproduce. See
 * [ADR 0003](../docs/adr/0003-descriptions-are-plain-text.md).
 */

/** The node types `toAdf` can produce, and so the only ones it can round-trip. */
const SUPPORTED_NODES = new Set(["doc", "paragraph", "text"]);

interface AdfNode {
  type?: unknown;
  text?: unknown;
  content?: unknown;
  marks?: unknown;
  attrs?: unknown;
}

/** A Description read out: the text, and what lost its shape getting there. */
export interface RenderedDescription {
  text: string;
  /** Node and mark types whose structure `renderAdf` could not reproduce. */
  degraded: string[];
}

/**
 * Render text as ADF. Each line becomes a paragraph (blank line -> empty
 * paragraph) so multi-line descriptions round-trip through `fromAdf`.
 */
export function toAdf(text: string): Record<string, unknown> {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line.length > 0 ? [{ type: "text", text: line }] : [],
    })),
  };
}

/**
 * Render ADF back to text, the inverse of `toAdf`. Only faithful for documents
 * `unsupportedAdfNodes` reports nothing for — anything richer loses whatever it
 * is not made of text nodes, which is why callers check first.
 */
export function fromAdf(doc: unknown): string {
  if (!isNode(doc)) return "";

  return childrenOf(doc)
    .map((paragraph) =>
      childrenOf(paragraph)
        .map((child) => typeof child.text === "string" ? child.text : "")
        .join("")
    )
    .join("\n");
}

/**
 * The constructs in `doc` that `toAdf` cannot produce, sorted and deduplicated.
 * Empty means the document survives an edit; anything else would be destroyed by
 * writing plain text back over it. Marks count — a bold run is a plain text node
 * carrying `marks`, so ignoring them would let formatting vanish silently.
 */
export function unsupportedAdfNodes(doc: unknown): string[] {
  const found = new Set<string>();

  const walk = (node: unknown): void => {
    if (!isNode(node)) return;

    if (typeof node.type === "string" && !SUPPORTED_NODES.has(node.type)) {
      found.add(node.type);
    }

    if (Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (isNode(mark) && typeof mark.type === "string") {
          found.add(mark.type);
        }
      }
    }

    for (const child of childrenOf(node)) {
      walk(child);
    }
  };

  walk(doc);

  return [...found].sort();
}

/**
 * Read any Description out as markdown-flavoured text. Unlike `fromAdf`, which
 * is `toAdf`'s exact inverse and so only faithful for plain paragraphs, this
 * walks the whole document — see
 * [ADR 0004](../docs/adr/0004-descriptions-read-richer-than-they-write.md).
 *
 * The rule is that content never disappears quietly: a construct whose shape
 * markdown cannot carry still has its text emitted, and its type named in
 * `degraded`. A caller is never handed a blank body without being told why.
 *
 * Rendering is one-way. Feeding the result back through `toAdf` writes it as
 * flat paragraphs, turning a real list into text shaped like one.
 */
export function renderAdf(doc: unknown): RenderedDescription {
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

/** Marks markdown can carry, innermost first so `**bold**` nests inside a link. */
const MARK_WRAPPERS: Array<[string, string]> = [
  ["code", "`"],
  ["strike", "~~"],
  ["em", "*"],
  ["strong", "**"],
];

/**
 * Blocks join with a single newline rather than a blank line, mirroring
 * `toAdf`'s line-per-paragraph model. A Description made only of paragraphs
 * therefore renders exactly as `fromAdf` renders it.
 */
function renderBlocks(nodes: AdfNode[], degraded: Set<string>): string {
  return nodes.map((node) => renderBlock(node, degraded)).join("\n");
}

function renderBlock(node: AdfNode, degraded: Set<string>): string {
  const type = typeof node.type === "string" ? node.type : "";
  const children = childrenOf(node);

  switch (type) {
    case "paragraph":
      return renderInline(children, degraded);

    case "heading": {
      const level = Math.min(Math.max(numberAttr(node, "level") ?? 1, 1), 6);
      return `${"#".repeat(level)} ${renderInline(children, degraded)}`;
    }

    case "bulletList":
      return renderList(children, degraded, () => "- ");

    case "orderedList": {
      const start = numberAttr(node, "order") ?? 1;
      return renderList(children, degraded, (index) => `${start + index}. `);
    }

    case "taskList":
      return renderList(
        children,
        degraded,
        (_index, item) =>
          stringAttr(item, "state") === "DONE" ? "- [x] " : "- [ ] ",
      );

    case "listItem":
    case "taskItem":
    case "decisionItem":
      return renderContainer(node, degraded);

    case "codeBlock": {
      const language = stringAttr(node, "language") ?? "";
      return `\`\`\`${language}\n${rawText(children)}\n\`\`\``;
    }

    case "blockquote":
      return prefixLines(renderBlocks(children, degraded), "> ");

    // A panel keeps its text and loses only which kind of panel it was.
    case "panel":
      degraded.add(type);
      return prefixLines(renderBlocks(children, degraded), "> ");

    case "rule":
      return "---";

    case "table":
      degraded.add(type);
      return children
        .map((row) => renderTableRow(row, degraded))
        .join("\n");

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
      return title ? `${title}\n${body}` : body;
    }

    default:
      if (type) degraded.add(type);
      return renderContainer(node, degraded);
  }
}

/** A cell keeps its text; the grid is what the `table` report is about. */
function renderTableRow(row: AdfNode, degraded: Set<string>): string {
  return childrenOf(row)
    .map((cell) => renderBlocks(childrenOf(cell), degraded).replace(/\n/g, " "))
    .join(" | ");
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

  const inline = children.some((child) =>
    typeof child.type === "string" && INLINE_NODES.has(child.type)
  );

  return inline
    ? renderInline(children, degraded)
    : renderBlocks(children, degraded);
}

function renderInline(nodes: AdfNode[], degraded: Set<string>): string {
  return nodes.map((node) => renderInlineNode(node, degraded)).join("");
}

function renderInlineNode(node: AdfNode, degraded: Set<string>): string {
  const type = typeof node.type === "string" ? node.type : "";

  switch (type) {
    case "text":
      return applyMarks(
        typeof node.text === "string" ? node.text : "",
        node.marks,
        degraded,
      );

    case "hardBreak":
      return "\n";

    case "mention":
      return stringAttr(node, "text") ?? "";

    case "emoji":
      return stringAttr(node, "text") ?? stringAttr(node, "shortName") ?? "";

    case "inlineCard":
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

function applyMarks(
  text: string,
  marks: unknown,
  degraded: Set<string>,
): string {
  if (!Array.isArray(marks) || text.length === 0) return text;

  const names = marks
    .filter(isNode)
    .map((mark) => mark.type)
    .filter((type): type is string => typeof type === "string");

  let result = text;

  for (const [name, wrapper] of MARK_WRAPPERS) {
    if (names.includes(name)) result = `${wrapper}${result}${wrapper}`;
  }

  const carried = new Set(MARK_WRAPPERS.map(([name]) => name));
  for (const name of names) {
    if (name !== "link" && !carried.has(name)) degraded.add(name);
  }

  const link = marks
    .filter(isNode)
    .find((mark) => mark.type === "link");
  const href = link ? stringAttr(link, "href") : undefined;

  return href ? `[${result}](${href})` : result;
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

function prefixLines(text: string, prefix: string): string {
  return indent(text, prefix, prefix);
}

function indent(text: string, first: string, rest: string): string {
  return text
    .split("\n")
    .map((line, index) => `${index === 0 ? first : rest}${line}`)
    .join("\n");
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
