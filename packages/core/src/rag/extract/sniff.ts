/** File kind from name + magic bytes, and the checks every import runs before extraction (§10.4: 0 bytes, corrupt, encrypted). */
import { ExtractError, type DocKind } from "../types";

export const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024;

const ascii = (b: Uint8Array, start: number, len: number): string => String.fromCharCode(...b.subarray(start, start + len));

export function kindOf(name: string, head: Uint8Array): DocKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (head.length >= 5 && ascii(head, 0, 5) === "%PDF-") return "pdf";
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return ext === "docx" ? "docx" : ext === "xlsx" || ext === "xlsm" ? "xlsx" : "unknown";
  if (head.length >= 8 && head[0] === 0x89 && ascii(head, 1, 3) === "PNG") return "image";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "xlsx" || ext === "xlsm") return "xlsx";
  if (ext === "html" || ext === "htm" || ext === "xhtml" || looksLikeHtml(head)) return "html";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "txt" || ext === "text" || ext === "log" || ext === "json" || ext === "xml") return "txt";
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "heic" || ext === "webp") return "image";
  return looksLikeText(head) ? "txt" : "unknown";
}

/** A `.txt` that starts with a doctype or an html tag is read as HTML, so its markup never reaches the index. */
export function looksLikeHtml(head: Uint8Array): boolean {
  const start = ascii(head, 0, Math.min(head.length, 64)).replace(/^\xEF\xBB\xBF/, "").trimStart().toLowerCase();
  return start.startsWith("<!doctype html") || start.startsWith("<html");
}

/** Bytes that decode without NULs and with few controls are treated as text. */
export function looksLikeText(head: Uint8Array): boolean {
  if (!head.length) return true;
  let bad = 0;
  for (const b of head.subarray(0, 512)) {
    if (b === 0) return false;
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) bad++;
  }
  return bad < 8;
}

/** Throws ExtractError for what no extractor should even try. */
export function assertImportable(name: string, bytes: number, head: Uint8Array): DocKind {
  if (bytes === 0) throw new ExtractError("empty", `${name} is empty`);
  if (bytes > MAX_DOCUMENT_BYTES) throw new ExtractError("too-large", `${name} is larger than ${MAX_DOCUMENT_BYTES} bytes`);
  const kind = kindOf(name, head);
  if (kind === "unknown") throw new ExtractError("unsupported", `${name}: unsupported file type`);
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" && (head.length < 5 || ascii(head, 0, 5) !== "%PDF-")) throw new ExtractError("corrupt", `${name} is not a PDF`);
  return kind;
}
