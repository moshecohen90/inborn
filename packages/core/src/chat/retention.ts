import type { Chat } from "./types";

export const DAY_MS = 86_400_000;

/** S52 › Security › Auto-delete chats: Off / 1 / 7 / 30 days. */
export const AUTO_DELETE_DAYS = [0, 1, 7, 30] as const;
export type AutoDeleteDays = (typeof AUTO_DELETE_DAYS)[number];

/** Pinned is the user's explicit "keep" (the rule is explicit and user-controlled, §7.5); incognito never reaches storage anyway. */
export const retentionExempt = (chat: Chat): boolean => !!chat.pinned || chat.incognito;

/** Epoch ms at which the rule removes this chat, or null when the rule is off or the chat is exempt. Age counts from the last change. */
export function deletesAt(chat: Chat, days: number, dayMs = DAY_MS): number | null {
  if (days <= 0 || retentionExempt(chat)) return null;
  return chat.updatedAt + days * dayMs;
}

/** Whole days left before deletion for the S20 tag ("Deletes in 3 days"); 0 once due; null when the rule does not apply. */
export function deletesInDays(chat: Chat, days: number, now: number, dayMs = DAY_MS): number | null {
  const at = deletesAt(chat, days, dayMs);
  if (at === null) return null;
  return Math.max(0, Math.ceil((at - now) / dayMs));
}

export function expiredChats(chats: Chat[], days: number, now: number, dayMs = DAY_MS): Chat[] {
  return chats.filter((c) => {
    const at = deletesAt(c, days, dayMs);
    return at !== null && at <= now;
  });
}

export interface RetentionStore {
  listChats(): Promise<Chat[]>;
  deleteChats(ids: string[]): Promise<void>;
}

/** Runs the rule once (app start, return to the foreground, hourly while open) and returns the ids it removed; `keep` is the chat on screen, which waits for the next run. */
export async function applyRetention(store: RetentionStore, days: number, now: number, dayMs = DAY_MS, keep: readonly string[] = []): Promise<string[]> {
  if (days <= 0) return [];
  const ids = expiredChats(await store.listChats(), days, now, dayMs)
    .map((c) => c.id)
    .filter((id) => !keep.includes(id));
  if (ids.length) await store.deleteChats(ids);
  return ids;
}
