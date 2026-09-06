import { File, Paths } from "expo-file-system";

/** Strict mode and per-chat attachments: small JSON in the document directory (the vault keeps its record the same way). */
export interface DocumentPrefs {
  version: 1;
  strict: boolean;
  attachments: Record<string, string[]>;
}

const EMPTY: DocumentPrefs = { version: 1, strict: false, attachments: {} };
const file = (): File => new File(Paths.document, "documents.json");

export function readPrefs(): DocumentPrefs {
  try {
    const f = file();
    if (!f.exists) return { ...EMPTY, attachments: {} };
    const parsed = JSON.parse(f.textSync()) as Partial<DocumentPrefs>;
    return { ...EMPTY, ...parsed, attachments: parsed.attachments ?? {} };
  } catch {
    return { ...EMPTY, attachments: {} };
  }
}

export function writePrefs(p: DocumentPrefs): void {
  try {
    file().write(JSON.stringify(p));
  } catch (e: unknown) {
    console.warn("[documents] prefs not written", e);
  }
}
