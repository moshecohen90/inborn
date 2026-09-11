import { DAY_MS, applyRetention, deletesInDays, type Chat, type RetentionStore } from "@inborn/core";

/* Dev bundles may shrink a "day" (EXPO_PUBLIC_AUTODELETE_DAY_MS=60000) so the rule can be watched on an emulator in minutes; store builds never set it. */
const DEV_DAY_MS = __DEV__ ? Number(process.env.EXPO_PUBLIC_AUTODELETE_DAY_MS ?? NaN) : NaN;
export const RETENTION_DAY_MS = Number.isFinite(DEV_DAY_MS) && DEV_DAY_MS > 0 ? DEV_DAY_MS : DAY_MS;

/** Re-checked while the app stays open, so a phone left on the chat list still honours the rule (§10 #66: no wall-clock timers). */
export const RETENTION_TICK_MS = Math.min(3_600_000, RETENTION_DAY_MS);

export const runRetention = (store: RetentionStore, days: number, keep: readonly string[] = [], now = Date.now()): Promise<string[]> => applyRetention(store, days, now, RETENTION_DAY_MS, keep);

export const retentionDaysLeft = (chat: Chat, days: number, now = Date.now()): number | null => deletesInDays(chat, days, now, RETENTION_DAY_MS);
