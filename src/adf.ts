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

function isNode(value: unknown): value is AdfNode {
  return typeof value === "object" && value !== null;
}

function childrenOf(node: AdfNode): AdfNode[] {
  return Array.isArray(node.content) ? node.content.filter(isNode) : [];
}
