import type { MeterState } from "@inborn/core";
import type { ThemeMode } from "@inborn/ui";

export type PerformanceProfile = "eco" | "balanced" | "max";
export type AutoDeleteDays = 0 | 1 | 7 | 30;

export interface LockPrefs {
  enabled: boolean;
  timeoutSec: number;
  hideInSwitcher: boolean;
  screenshotProtection: boolean;
  /** null = off; otherwise wipe after this many failed unlock attempts. */
  wipeAfterFailed: number | null;
}

export interface Prefs {
  onboarded: boolean;
  installedAt: number;
  themeMode: ThemeMode;
  textScale: number;
  /** null = follow the device. */
  locale: string | null;
  answerLanguage: string | null;
  haptics: boolean;
  lock: LockPrefs;
  lockReminderShown: boolean;
  autoDeleteDays: AutoDeleteDays;
  clipboardExpirySec: number;
  /** Family-safe mode (§11.1 Guideline 1.2): on by default, adults may turn it off in Settings. */
  contentSafety: boolean;
  performance: PerformanceProfile;
  autoPower: boolean;
  neverAutoSwitch: boolean;
  wifiOnly: boolean;
  meter: MeterState;
}

export const defaultPrefs = (now: number): Prefs => ({
  onboarded: false,
  installedAt: now,
  themeMode: "auto",
  textScale: 1,
  locale: null,
  answerLanguage: null,
  haptics: true,
  lock: { enabled: false, timeoutSec: 0, hideInSwitcher: true, screenshotProtection: false, wipeAfterFailed: null },
  lockReminderShown: false,
  autoDeleteDays: 0,
  clipboardExpirySec: 0,
  contentSafety: true,
  performance: "balanced",
  autoPower: true,
  neverAutoSwitch: false,
  wifiOnly: true,
  meter: { outBytes: 0, inBytes: 0, lastTx: 0, lastRx: 0, since: now },
});

/** Unknown or missing fields fall back to defaults so an older prefs file never breaks boot. */
/** A stored value the app can trust as prefs: an object carrying the onboarding flag (partial files and "null" are not). */
export const isPrefsLike = (raw: unknown): raw is Partial<Prefs> & { onboarded: boolean } => typeof raw === "object" && raw !== null && typeof (raw as { onboarded?: unknown }).onboarded === "boolean";

/** The primary file when it is usable, else the last good copy: a write cut short by the OS never sends the user back to onboarding (QA F12). */
export function recoverPrefs(primary: unknown, backup: unknown): unknown {
  if (isPrefsLike(primary)) return primary;
  if (isPrefsLike(backup)) return backup;
  return primary ?? backup ?? null;
}

export function mergePrefs(raw: unknown, now: number): Prefs {
  const d = defaultPrefs(now);
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<Prefs> & { themeMode?: ThemeMode | "system" };
  const merged = { ...d, ...r, lock: { ...d.lock, ...(r.lock ?? {}) }, meter: { ...d.meter, ...(r.meter ?? {}) } };
  // F309: pre-round-65 prefs stored the old "system" value; it means the same thing "auto" means now.
  if ((merged.themeMode as string) === "system") merged.themeMode = "auto";
  return merged;
}
