/**
 * DOCX without mammoth: unzip word/document.xml and walk its paragraphs. Tracked changes resolve to the final
 * text (insertions kept, deletions dropped; spec S40). Page breaks (explicit and Word's lastRenderedPageBreak)
 * become page anchors; without any, the text is sectioned like a TXT file.
 */
import { unzipSync } from "fflate";
import { ExtractError, type DocSource, type ExtractedPage, type OpenedDocument, type TextExtractor } from "../types";
import { paginate } from "./text";

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
export function decodeXml(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|apos);|&#x([0-9a-fA-F]+);|&#(\d+);/g, (m, hex?: string, dec?: string) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(Number(dec)) : (ENTITIES[m] ?? m)));
}

export const PAGE_BREAK = "\f";

/** Paragraph XML → its final text; page breaks inside become PAGE_BREAK characters. */
export function paragraphText(xml: string): string {
  const withoutDeleted = xml.replace(/<w:del\b[\s\S]*?<\/w:del>/g, "").replace(/<w:moveFrom\b[\s\S]*?<\/w:moveFrom>/g, "");
  let out = "";
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<w:tab\s*\/>|<w:br\s+w:type="page"\s*\/>|<w:br\s*\/>|<w:lastRenderedPageBreak\s*\/>|<w:cr\s*\/>/g;
  for (const m of withoutDeleted.matchAll(re)) {
    const tag = m[0];
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (tag.startsWith("<w:tab")) out += "\t";
    else if (tag.includes('w:type="page"') || tag.startsWith("<w:lastRenderedPageBreak")) out += PAGE_BREAK;
    else if (tag.startsWith("<w:br") || tag.startsWith("<w:cr")) out += "\n";
  }
  return out;
}

/** The whole body as text: paragraphs separated by newlines, table cells by " | ", pages by PAGE_BREAK. */
export function documentXmlToText(xml: string): string {
  const body = xml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/)?.[1] ?? xml;
  const lines: string[] = [];
  const re = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>|<w:p\b[^>]*\/>|<\/w:tc>|<w:tr\b[^>]*>|<w:tbl\b[^>]*>|<\/w:tbl>/g;
  let row: string[] | null = null;
  let cell = "";
  const pageBreakBefore = (para: string) => /<w:pageBreakBefore\s*\/?>/.test(para);
  for (const m of body.matchAll(re)) {
    const tag = m[0];
    if (tag.startsWith("<w:tbl")) row = null;
    else if (tag.startsWith("</w:tbl")) {
      if (row?.length) lines.push(row.join(" | "));
      row = null;
      lines.push("");
    } else if (tag.startsWith("<w:tr")) {
      if (row?.length) lines.push(row.join(" | "));
      row = [];
      cell = "";
    } else if (tag === "</w:tc>") {
      if (row) row.push(cell.trim());
      cell = "";
    } else if (m[1] !== undefined) {
      const text = (pageBreakBefore(m[1]) ? PAGE_BREAK : "") + paragraphText(m[1]);
      if (row) cell += (cell ? " " : "") + text;
      else lines.push(text);
    }
  }
  return lines.join("\n");
}

export class DocxExtractor implements TextExtractor {
  constructor(private readonly readBytes: (uri: string) => Promise<Uint8Array>) {}

  supports(kind: DocSource["kind"]): boolean {
    return kind === "docx";
  }

  async open(source: DocSource): Promise<OpenedDocument> {
    const bytes = await this.readBytes(source.uri);
    if (!bytes.length) throw new ExtractError("empty");
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
    } catch (e: unknown) {
      throw new ExtractError("corrupt", e instanceof Error ? e.message : "not a zip");
    }
    const xmlBytes = entries["word/document.xml"];
    if (!xmlBytes) throw new ExtractError("corrupt", "no word/document.xml");
    const text = documentXmlToText(new TextDecoder().decode(xmlBytes));
    const explicit = text.split(PAGE_BREAK).map((p) => p.trim());
    const pages = explicit.length > 1 ? explicit.flatMap((p) => (p ? paginate(p) : [])) : paginate(text);
    return {
      pages: pages.length,
      page: async (i): Promise<ExtractedPage> => ({ page: i + 1, text: pages[i] ?? "", needsOcr: false }),
      close: async () => undefined,
    };
  }
}
