/** Web + desktop: localStorage, like the other web preferences. */
export interface DocumentPrefs {
  version: 1;
  strict: boolean;
  attachments: Record<string, string[]>;
}

const KEY = "inborn.documents.prefs";
const EMPTY: DocumentPrefs = { version: 1, strict: false, attachments: {} };

export function readPrefs(): DocumentPrefs {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return { ...EMPTY, attachments: {} };
    const parsed = JSON.parse(raw) as Partial<DocumentPrefs>;
    return { ...EMPTY, ...parsed, attachments: parsed.attachments ?? {} };
  } catch {
    return { ...EMPTY, attachments: {} };
  }
}

export function writePrefs(p: DocumentPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: preferences last for the session only */
  }
}
