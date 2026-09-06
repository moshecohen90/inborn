/** Web + desktop: localStorage, like the other web preferences. */
export interface DocumentPrefs {
  version: 1;
  strict: boolean;
  attachments: Record<string, string[]>;
  /** The user's own list for the redaction sheet (people, companies, matters); the mapping itself is never written. */
  redactNames: string[];
  redactDates: boolean;
}

const KEY = "inborn.documents.prefs";
const EMPTY: DocumentPrefs = { version: 1, strict: false, attachments: {}, redactNames: [], redactDates: false };

export function readPrefs(): DocumentPrefs {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return { ...EMPTY, attachments: {}, redactNames: [] };
    const parsed = JSON.parse(raw) as Partial<DocumentPrefs>;
    return { ...EMPTY, ...parsed, attachments: parsed.attachments ?? {}, redactNames: parsed.redactNames ?? [] };
  } catch {
    return { ...EMPTY, attachments: {}, redactNames: [] };
  }
}

export function writePrefs(p: DocumentPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: preferences last for the session only */
  }
}
