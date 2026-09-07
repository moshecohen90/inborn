/**
 * XLSX without a spreadsheet library: the workbook lists its sheets, each sheet's XML is inflated on its own when its
 * page is read, and every row becomes one line "Sheet · row N: a | b | c" so a citation points at a sheet and a row.
 * Shared strings, inline strings, formula results, booleans and ISO dates are read; number formats (a date stored as
 * 45123) are not resolved, the raw number is kept.
 */
import { unzipSync } from "fflate";
import { ExtractError, type DocSource, type ExtractedPage, type OpenedDocument, type TextExtractor } from "../types";
import { decodeXml } from "./docx";

export interface SheetInfo {
  name: string;
  path: string;
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** Sheet names in workbook order, resolved to their zip paths through the relationships part. */
export function listSheets(workbookXml: string, relsXml: string): SheetInfo[] {
  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const sheets: SheetInfo[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(attr(m[0], "name") ?? "");
    const rid = attr(m[0], "r:id") ?? attr(m[0], "id");
    const path = rid ? targets.get(rid) : undefined;
    if (path && !/\bstate="(hidden|veryHidden)"/.test(m[0])) sheets.push({ name: name || `Sheet${sheets.length + 1}`, path });
  }
  return sheets;
}

/** `<si>` entries, rich runs concatenated; index = the `<v>` of a `t="s"` cell. */
export function sharedStrings(sstXml: string): string[] {
  const out: string[] = [];
  for (const m of sstXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) out.push(textRuns(m[1]!));
  return out;
}

const textRuns = (xml: string): string => {
  let s = "";
  for (const m of xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += decodeXml(m[1]!);
  return s;
};

/** "A" → 0, "Z" → 25, "AA" → 26. */
export function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.toUpperCase()) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

const cellValue = (cell: string, inner: string, strings: string[]): string => {
  const t = attr(cell, "t");
  if (t === "inlineStr") return textRuns(inner);
  const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
  if (v === undefined) return "";
  if (t === "s") return strings[Number(v)] ?? "";
  if (t === "b") return v === "1" ? "TRUE" : "FALSE";
  if (t === "e") return "";
  if (t === "str" || t === "d") return decodeXml(v);
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : decodeXml(v);
};

/** One sheet's XML → lines; an empty row is skipped, gaps between filled cells stay so columns line up. */
export function sheetToLines(sheetXml: string, sheetName: string, strings: string[]): string[] {
  const lines: string[] = [];
  for (const row of sheetXml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (row[2] === undefined) continue;
    const r = attr(`<row${row[1]}>`, "r") ?? String(lines.length + 1);
    const cells: string[] = [];
    let next = 0;
    for (const c of row[2]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c${c[1]}>`;
      const ref = attr(tag, "r");
      const col = ref ? columnIndex(ref) : next;
      const value = c[2] === undefined ? "" : cellValue(tag, c[2], strings).replace(/\s+/g, " ").trim();
      if (value) {
        while (cells.length < col) cells.push("");
        cells[col] = value;
      }
      next = col + 1;
    }
    if (cells.some(Boolean)) lines.push(`${sheetName} · row ${r}: ${cells.join(" | ")}`);
  }
  return lines;
}

const decode = (b: Uint8Array | undefined): string => (b ? new TextDecoder().decode(b) : "");

export class XlsxExtractor implements TextExtractor {
  constructor(private readonly readBytes: (uri: string) => Promise<Uint8Array>) {}

  supports(kind: DocSource["kind"]): boolean {
    return kind === "xlsx";
  }

  async open(source: DocSource): Promise<OpenedDocument> {
    const bytes = await this.readBytes(source.uri);
    if (!bytes.length) throw new ExtractError("empty");
    let parts: Record<string, Uint8Array>;
    try {
      parts = unzipSync(bytes, { filter: (f) => f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels" || f.name === "xl/sharedStrings.xml" });
    } catch (e: unknown) {
      throw new ExtractError("corrupt", e instanceof Error ? e.message : "not a zip");
    }
    if (!parts["xl/workbook.xml"]) throw new ExtractError("corrupt", "no xl/workbook.xml");
    const sheets = listSheets(decode(parts["xl/workbook.xml"]), decode(parts["xl/_rels/workbook.xml.rels"]));
    const strings = sharedStrings(decode(parts["xl/sharedStrings.xml"]));
    return {
      pages: sheets.length,
      /* One sheet is one page: inflated when asked for, so a workbook with twenty large sheets never sits expanded in memory. */
      page: async (i): Promise<ExtractedPage> => {
        const sheet = sheets[i];
        if (!sheet) return { page: i + 1, text: "", needsOcr: false };
        const xml = decode(unzipSync(bytes, { filter: (f) => f.name === sheet.path })[sheet.path]);
        return { page: i + 1, text: sheetToLines(xml, sheet.name, strings).join("\n"), needsOcr: false };
      },
      close: async () => undefined,
    };
  }
}
