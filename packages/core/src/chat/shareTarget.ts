/** What another app handed us (spec §7.7: share sheet, ACTION_SEND, ACTION_PROCESS_TEXT). Normalised from every native shape. */
export interface SharedFile {
  uri: string;
  name: string;
  mimeType: string | null;
  bytes: number | null;
}

export type SharePayload =
  | { kind: "text"; text: string }
  /** Selected text from another app's edit menu; `replaceable` = the caller accepts a result back ("Replace", S43). */
  | { kind: "processText"; text: string; replaceable: boolean }
  | { kind: "files"; files: SharedFile[]; text?: string };

/** S43 "huge text: clipped with a message" happens in the quick-action sheet; this is the hard cap for what we keep in memory. */
export const SHARE_TEXT_MAX_CHARS = 50_000;

type RawFile = { uri?: unknown; path?: unknown; contentUri?: unknown; name?: unknown; fileName?: unknown; mimeType?: unknown; bytes?: unknown; size?: unknown; fileSize?: unknown };
type Raw = { kind?: unknown; type?: unknown; text?: unknown; webUrl?: unknown; readonly?: unknown; files?: unknown };

const str = (v: unknown): string | null => (typeof v === "string" && v.length ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function parseFile(raw: unknown): SharedFile | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as RawFile;
  const uri = str(f.uri) ?? str(f.path) ?? str(f.contentUri);
  if (!uri) return null;
  const name = str(f.name) ?? str(f.fileName) ?? decodeURIComponent(uri.split("/").pop() ?? "") ?? "file";
  return { uri, name: name || "file", mimeType: str(f.mimeType), bytes: num(f.bytes) ?? num(f.size) ?? num(f.fileSize) };
}

/**
 * Accepts the Android module's map (`kind`), and expo-share-intent's parsed iOS value (`type` text / weburl / file / media).
 * Null when nothing usable was shared.
 */
export function parseSharePayload(raw: unknown): SharePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const kind = str(r.kind) ?? str(r.type);
  const text = (str(r.text) ?? str(r.webUrl))?.slice(0, SHARE_TEXT_MAX_CHARS) ?? null;
  const files = Array.isArray(r.files) ? r.files.map(parseFile).filter((f): f is SharedFile => f !== null) : [];
  if (kind === "processText") return text ? { kind: "processText", text, replaceable: r.readonly !== true && r.readonly !== "true" } : null;
  if (files.length) return { kind: "files", files, ...(text ? { text } : {}) };
  return text ? { kind: "text", text } : null;
}

/** expo-share-intent hands the extension's result over as `<scheme>://dataUrl=<key>#<type>`; the router must not treat it as a route. */
export const isShareHandoffPath = (path: string): boolean => /(^|\/|:\/\/)dataUrl=/.test(path);
