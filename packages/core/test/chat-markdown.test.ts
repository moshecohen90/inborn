import { describe, expect, it } from "vitest";
import { inlineToText, markdownToText, parseInline, parseMarkdown } from "../src/index";

describe("parseMarkdown blocks", () => {
  it("parses headings, paragraphs, hr and quotes", () => {
    const blocks = parseMarkdown("# Title\n\nSome *text* here\nsecond line\n\n---\n\n> quoted\n> more");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "hr", "quote"]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
    expect((blocks[1] as { children: unknown[] }).children).toEqual([
      { type: "text", text: "Some " },
      { type: "em", children: [{ type: "text", text: "text" }] },
      { type: "text", text: " here" },
      { type: "br" },
      { type: "text", text: "second line" },
    ]);
    expect(blocks[3]).toMatchObject({ type: "quote", children: [{ type: "paragraph" }] });
  });

  it("parses closed code blocks with a language and keeps an open fence as text until it closes", () => {
    const closed = parseMarkdown("```ts\nconst a = 1;\n```\nafter");
    expect(closed[0]).toEqual({ type: "code", lang: "ts", text: "const a = 1;", open: false });
    expect(closed[1]).toMatchObject({ type: "paragraph" });
    const open = parseMarkdown("```python\nprint(1)\nprint(2)");
    expect(open).toEqual([{ type: "code", lang: "python", text: "print(1)\nprint(2)", open: true }]);
  });

  it("parses bullet and ordered lists with nesting", () => {
    const blocks = parseMarkdown("- one\n- two\n  - nested\n- three\n\n1. a\n2. b");
    expect(blocks).toHaveLength(2);
    const ul = blocks[0]!;
    expect(ul).toMatchObject({ type: "list", ordered: false });
    if (ul.type !== "list") throw new Error();
    expect(ul.items).toHaveLength(3);
    expect(ul.items[1]!.children.map((b) => b.type)).toEqual(["paragraph", "list"]);
    const ol = blocks[1]!;
    expect(ol).toMatchObject({ type: "list", ordered: true, start: 1 });
    if (ol.type !== "list") throw new Error();
    expect(ol.items.map((i) => markdownLike(i.children))).toEqual(["a", "b"]);
  });

  it("parses tables with alignment and pads short rows", () => {
    const [t] = parseMarkdown("| Name | Qty |\n|:---|---:|\n| apples | 3 |\n| pears |");
    if (!t || t.type !== "table") throw new Error("no table");
    expect(t.header.map(inlineToText)).toEqual(["Name", "Qty"]);
    expect(t.align).toEqual(["left", "right"]);
    expect(t.rows.map((r) => r.map(inlineToText))).toEqual([
      ["apples", "3"],
      ["pears", ""],
    ]);
  });

  it("shows display math verbatim and keeps inline math", () => {
    const blocks = parseMarkdown("$$\nE = mc^2\n$$\n\nInline $x^2$ here");
    expect(blocks[0]).toEqual({ type: "math", text: "E = mc^2" });
    expect(blocks[1]).toMatchObject({ type: "paragraph", children: [{ type: "text", text: "Inline " }, { type: "math", text: "x^2" }, { type: "text", text: " here" }] });
  });
});

describe("parseInline", () => {
  it("handles strong, em, strike, code and escapes", () => {
    expect(parseInline("**bold** _em_ ~~gone~~ `x = 1` \\*literal\\*")).toEqual([
      { type: "strong", children: [{ type: "text", text: "bold" }] },
      { type: "text", text: " " },
      { type: "em", children: [{ type: "text", text: "em" }] },
      { type: "text", text: " " },
      { type: "strike", children: [{ type: "text", text: "gone" }] },
      { type: "text", text: " " },
      { type: "code", text: "x = 1" },
      { type: "text", text: " *literal*" },
    ]);
  });

  it("keeps links as text nodes with their url and never drops snake_case underscores", () => {
    expect(parseInline("see [docs](https://example.com/a) and my_var_name")).toEqual([
      { type: "text", text: "see " },
      { type: "link", children: [{ type: "text", text: "docs" }], url: "https://example.com/a" },
      { type: "text", text: " and my_var_name" },
    ]);
    expect(inlineToText(parseInline("[docs](https://example.com)"))).toBe("docs (https://example.com)");
  });

  it("turns images into a placeholder instead of loading anything", () => {
    expect(parseInline("![diagram](https://x/y.png)")).toEqual([{ type: "text", text: "[image: diagram]" }]);
  });

  it("leaves unbalanced markers as text", () => {
    expect(parseInline("2 * 3 = 6 and a_b")).toEqual([{ type: "text", text: "2 * 3 = 6 and a_b" }]);
    expect(parseInline("**open")).toEqual([{ type: "text", text: "**open" }]);
  });

  it("parses Hebrew and mixed RTL/LTR content without breaking on direction", () => {
    const nodes = parseInline("**שלום** עולם `code` ואז end");
    expect(nodes[0]).toEqual({ type: "strong", children: [{ type: "text", text: "שלום" }] });
    expect(inlineToText(nodes)).toBe("שלום עולם code ואז end");
  });
});

describe("markdownToText", () => {
  it("produces speakable text without syntax", () => {
    expect(markdownToText("# Hi\n\n- **a**\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |")).toBe("Hi\n\n• a\n• b\n\nx | y\n1 | 2");
  });
});

function markdownLike(blocks: ReturnType<typeof parseMarkdown>): string {
  return blocks.map((b) => (b.type === "paragraph" ? inlineToText(b.children) : b.type)).join("|");
}
