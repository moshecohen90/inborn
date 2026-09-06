import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { DocxExtractor, ExtractError, TextFileExtractor, assertImportable, base64ToInt8, csvToText, decodeText, documentXmlToText, int8ToBase64, kindOf, paginate, quantize } from "../src/index";

const bytesOf = (map: Record<string, Uint8Array>) => async (uri: string) => {
  const b = map[uri];
  if (!b) throw new Error(`no fixture ${uri}`);
  return b;
};

const docx = (documentXml: string): Uint8Array =>
  zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    "word/document.xml": strToU8(documentXml),
  });

const P = (inner: string, attrs = "") => `<w:p${attrs}>${inner}</w:p>`;
const R = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const body = (inner: string) => `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${inner}</w:body></w:document>`;

describe("sniffing", () => {
  it("recognizes kinds from magic bytes and names, refuses empty, corrupt and unknown files", () => {
    expect(kindOf("a.pdf", strToU8("%PDF-1.7\n"))).toBe("pdf");
    expect(kindOf("a.docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe("docx");
    expect(kindOf("a.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("image");
    expect(kindOf("notes.md", strToU8("# hi"))).toBe("md");
    expect(kindOf("data.csv", strToU8("a,b"))).toBe("csv");
    expect(kindOf("blob.bin", new Uint8Array([0, 1, 2, 3]))).toBe("unknown");
    expect(() => assertImportable("zero.pdf", 0, new Uint8Array())).toThrow(ExtractError);
    expect(() => assertImportable("zero.pdf", 0, new Uint8Array())).toThrow(/empty/);
    expect(() => assertImportable("broken.pdf", 12, strToU8("not a pdf at"))).toThrow(/not a PDF/);
    expect(() => assertImportable("x.exe", 12, new Uint8Array([0x4d, 0x5a, 0, 0]))).toThrow(/unsupported/);
    expect(assertImportable("ok.txt", 5, strToU8("hello"))).toBe("txt");
  });
});

describe("text files", () => {
  it("decodes BOMs and UTF-16, sections into pages at paragraph boundaries", async () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0xd7, 0xa9, 0xd7, 0x9c]))).toBe("של");
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]))).toBe("AB");
    expect(decodeText(new Uint8Array([0xe9, 0x74, 0xe9]))).toBe("été");
    const paragraphs = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}. ` + "word ".repeat(30)).join("\n\n");
    const pages = paginate(paragraphs, 1000);
    expect(pages.length).toBeGreaterThan(5);
    expect(pages.every((p) => p.length <= 1000)).toBe(true);
    expect(pages.join("\n\n").replace(/\s+/g, " ")).toBe(paragraphs.replace(/\s+/g, " "));
    const x = new TextFileExtractor(bytesOf({ "f://a.md": strToU8(paragraphs), "f://empty": new Uint8Array() }));
    const opened = await x.open({ uri: "f://a.md", name: "a.md", kind: "md", bytes: 1 });
    expect(opened.pages).toBe(paginate(paragraphs).length);
    expect((await opened.page(0)).text.startsWith("Paragraph 1.")).toBe(true);
    await expect(x.open({ uri: "f://empty", name: "e.txt", kind: "txt", bytes: 0 })).rejects.toThrow(ExtractError);
  });

  it("turns CSV rows into header: value lines", () => {
    expect(csvToText("name,price\nWidget,10\nGadget,20")).toBe("Row 1: name: Widget; price: 10\nRow 2: name: Gadget; price: 20");
    expect(csvToText("a\tb\n1\t2")).toBe("Row 1: a: 1; b: 2");
  });
});

describe("DOCX", () => {
  it("extracts paragraphs, resolves tracked changes to the final text, and reads tables", () => {
    const xml = body(
      P(R("Hello ") + `<w:ins w:author="a">${R("inserted ")}</w:ins><w:del w:author="a"><w:r><w:delText>deleted </w:delText></w:r></w:del>` + R("world &amp; more.")) +
        `<w:tbl><w:tr><w:tc>${P(R("Item"))}</w:tc><w:tc>${P(R("Price"))}</w:tc></w:tr><w:tr><w:tc>${P(R("Widget"))}</w:tc><w:tc>${P(R("10"))}</w:tc></w:tr></w:tbl>` +
        P(R("After") + "<w:tab/>" + R("tab")),
    );
    expect(documentXmlToText(xml)).toBe("Hello inserted world & more.\nItem | Price\nWidget | 10\n\nAfter\ttab");
  });

  it("uses explicit and rendered page breaks as page anchors, sections otherwise", async () => {
    const paged = body(P(R("Page one text.")) + P('<w:r><w:br w:type="page"/></w:r>' + R("Page two text.")) + P("<w:r><w:lastRenderedPageBreak/></w:r>" + R("Page three text.")));
    const x = new DocxExtractor(bytesOf({ "f://p.docx": docx(paged), "f://long.docx": docx(body(Array.from({ length: 200 }, (_, i) => P(R(`Paragraph ${i} with some ordinary words in it.`))).join(""))), "f://bad.docx": strToU8("PK\u0003\u0004garbage") }));
    const opened = await x.open({ uri: "f://p.docx", name: "p.docx", kind: "docx", bytes: 1 });
    expect(opened.pages).toBe(3);
    expect((await opened.page(1)).text).toBe("Page two text.");
    expect((await opened.page(2)).text).toBe("Page three text.");
    const long = await x.open({ uri: "f://long.docx", name: "long.docx", kind: "docx", bytes: 1 });
    expect(long.pages).toBeGreaterThan(2);
    await expect(x.open({ uri: "f://bad.docx", name: "bad.docx", kind: "docx", bytes: 1 })).rejects.toThrow(/corrupt|zip/i);
  });

  it("handles Hebrew runs and numeric entities", () => {
    expect(documentXmlToText(body(P(R("שלום &#x5E2;&#1493;לם"))))).toBe("שלום עולם");
  });
});

describe("base64 int8", () => {
  it("round-trips quantized vectors of any length", () => {
    for (const n of [1, 2, 3, 64, 768, 1023]) {
      const { q } = quantize(new Float32Array(n).map((_, i) => Math.sin(i) - 0.3));
      expect(Array.from(base64ToInt8(int8ToBase64(q)))).toEqual(Array.from(q));
    }
  });
});
