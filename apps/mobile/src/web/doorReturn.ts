import { needsModel } from "./doorRoutes";

/** Where the download door's back arrow leads: the screen that opened it, the model in use there, and whether that screen was the chat's Model sheet. */
export interface DoorReturn {
  to: string;
  prev: string | null;
  sheet?: boolean;
}

const KEY = "inborn.web.doorReturn";
const SHEET_KEY = "inborn.web.reopenModelSheet";

/* Session storage: the door is a full page load away from the screen that opened it, and a new tab has no way back. */
function session(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function saveDoorReturn(r: DoorReturn | null): void {
  try {
    if (r) session()?.setItem(KEY, JSON.stringify(r));
    else session()?.removeItem(KEY);
  } catch {
    /* storage refused: the door shows no back arrow */
  }
}

export function readDoorReturn(): DoorReturn | null {
  try {
    const raw = session()?.getItem(KEY);
    const r = raw ? (JSON.parse(raw) as DoorReturn) : null;
    return r && typeof r.to === "string" ? r : null;
  } catch {
    return null;
  }
}

/**
 * The way back only while it still leads somewhere: a screen that needs no model, or the previous model still verified
 * here. The door for the model that was already in use is not a detour, so it gets no arrow either.
 */
export function doorBack(r: DoorReturn | null, installed: readonly string[], offered: string | null): DoorReturn | null {
  if (!r || (r.prev !== null && r.prev === offered)) return null;
  if (!needsModel(r.to)) return r;
  return r.prev !== null && installed.includes(r.prev) ? r : null;
}

export function markSheetReopen(): void {
  try {
    session()?.setItem(SHEET_KEY, "1");
  } catch {
    /* the chat opens without the sheet */
  }
}

/** Read once by the chat on its first render: the reader left the Model sheet for the door and came back. */
export function takeSheetReopen(): boolean {
  try {
    const s = session();
    const v = s?.getItem(SHEET_KEY) === "1";
    if (v) s?.removeItem(SHEET_KEY);
    return v;
  } catch {
    return false;
  }
}
