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

/** What a system picker hands over: the URI's last segment (a SAF id on Android), the provider's display name, the MIME type, the first bytes. */
export interface PickedMeta {
  uriName: string;
  displayName?: string | null;
  mimeType?: string | null;
  head?: Uint8Array;
}

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel.sheet.macroenabled.12": "xlsm",
  "text/html": "html",
  "application/xhtml+xml": "xhtml",
  "text/markdown": "md",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "text/plain": "txt",
  "application/json": "json",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/heic": "heic",
  "image/webp": "webp",
};

const hasExtension = (name: string): boolean => /\.[a-z0-9]{1,5}$/i.test(name);
/** Android's document provider ids ("document:1000000028", "1000000028") are not names. */
const looksLikeSafId = (name: string): boolean => /^(document:|raw:|primary:)?\d+$/i.test(name) || /^document:/i.test(name);

function magicExtension(head: Uint8Array | undefined): string | null {
  if (!head?.length) return null;
  if (head.length >= 5 && ascii(head, 0, 5) === "%PDF-") return "pdf";
  if (head.length >= 8 && head[0] === 0x89 && ascii(head, 1, 3) === "PNG") return "png";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpg";
  if (looksLikeHtml(head)) return "html";
  return null;
}

/**
 * The name to sniff and to show: the provider's display name when it carries an extension, else the URI name when it
 * is a real file name, else the best base plus an extension from the MIME type or the magic bytes. Without the
 * extension `.xlsx` / `.docx` (both zip) cannot be told apart and the Work gate (§7.3 row 8) would be bypassed.
 */
export function pickedFileName(meta: PickedMeta): string {
  const display = meta.displayName?.trim() ?? "";
  if (display && hasExtension(display)) return display;
  let uriName = meta.uriName.trim();
  try {
    uriName = decodeURIComponent(uriName);
  } catch {
    /* keep as is */
  }
  if (hasExtension(uriName) && !looksLikeSafId(uriName)) return uriName;
  const base = display || (looksLikeSafId(uriName) ? "" : uriName) || "document";
  const ext = (meta.mimeType && MIME_EXT[meta.mimeType.toLowerCase().split(";")[0]!.trim()]) || magicExtension(meta.head);
  return ext && !hasExtension(base) ? `${base}.${ext}` : base;
}
