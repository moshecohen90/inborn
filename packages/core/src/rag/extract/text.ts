/** TXT / MD / CSV: decode, then section into synthetic pages so citations can anchor ("§3"). */
import { ExtractError, type DocSource, type ExtractedPage, type OpenedDocument, type TextExtractor } from "../types";

/** Characters per synthetic page; cut at a paragraph or line boundary near this size. */
export const TEXT_PAGE_CHARS = 3000;

export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const body = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return new TextDecoder("windows-1252").decode(body);
  }
}

/** Splits text into pages of about `size` characters at paragraph, then line, then space boundaries. */
export function paginate(text: string, size = TEXT_PAGE_CHARS): string[] {
  const pages: string[] = [];
  let rest = text.replace(/\r\n?/g, "\n");
  while (rest.length > size) {
    const window = rest.slice(0, size);
    let cut = window.lastIndexOf("\n\n");
    if (cut < size / 2) cut = window.lastIndexOf("\n");
    if (cut < size / 2) cut = window.lastIndexOf(" ");
    if (cut < size / 2) cut = size;
    pages.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest.trim()) pages.push(rest);
  return pages;
}

/** CSV rows become "header: value" lines so a question about a column matches its header words. */
export function csvToText(csv: string): string {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return csv;
  const sep = (lines[0]!.match(/\t/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? "\t" : lines[0]!.includes(";") && !lines[0]!.includes(",") ? ";" : ",";
  const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const header = split(lines[0]!);
  return lines
    .slice(1)
    .map((l, i) => {
      const cells = split(l);
      return `Row ${i + 1}: ` + header.map((h, j) => `${h}: ${cells[j] ?? ""}`).join("; ");
    })
    .join("\n");
}

export class TextFileExtractor implements TextExtractor {
  constructor(private readonly readBytes: (uri: string) => Promise<Uint8Array>) {}

  supports(kind: DocSource["kind"]): boolean {
    return kind === "txt" || kind === "md" || kind === "csv";
  }

  async open(source: DocSource): Promise<OpenedDocument> {
    const bytes = await this.readBytes(source.uri);
    if (!bytes.length) throw new ExtractError("empty");
    const raw = decodeText(bytes);
    const text = source.kind === "csv" ? csvToText(raw) : raw;
    const pages = paginate(text);
    return {
      pages: pages.length,
      page: async (i): Promise<ExtractedPage> => ({ page: i + 1, text: pages[i] ?? "", needsOcr: false }),
      close: async () => undefined,
    };
  }
}
