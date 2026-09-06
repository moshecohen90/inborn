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
  performance: PerformanceProfile;
  autoPower: boolean;
  neverAutoSwitch: boolean;
  wifiOnly: boolean;
  meter: MeterState;
}

export const defaultPrefs = (now: number): Prefs => ({
  onboarded: false,
  installedAt: now,
  themeMode: "system",
  textScale: 1,
  locale: null,
  answerLanguage: null,
  haptics: true,
  lock: { enabled: false, timeoutSec: 0, hideInSwitcher: true, screenshotProtection: false, wipeAfterFailed: null },
  lockReminderShown: false,
  autoDeleteDays: 0,
  clipboardExpirySec: 0,
  performance: "balanced",
  autoPower: true,
  neverAutoSwitch: false,
  wifiOnly: true,
  meter: { outBytes: 0, inBytes: 0, lastTx: 0, lastRx: 0, since: now },
});

/** Unknown or missing fields fall back to defaults so an older prefs file never breaks boot. */
export function mergePrefs(raw: unknown, now: number): Prefs {
  const d = defaultPrefs(now);
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<Prefs>;
  return { ...d, ...r, lock: { ...d.lock, ...(r.lock ?? {}) }, meter: { ...d.meter, ...(r.meter ?? {}) } };
}
