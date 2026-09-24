import { describe, expect, it } from "vitest";
import { defaultPrefs, isPrefsLike, mergePrefs, recoverPrefs } from "./prefsTypes";

const good = { ...defaultPrefs(1000), onboarded: true, lock: { ...defaultPrefs(1000).lock, enabled: true } };

describe("recoverPrefs (QA F12: prefs survive an interrupted write)", () => {
  it("prefers the primary file when it parses as prefs", () => {
    expect(recoverPrefs(good, { ...good, onboarded: false })).toBe(good);
  });
  it("falls back to the backup when the primary is missing", () => {
    expect(recoverPrefs(null, good)).toBe(good);
  });
  it("falls back to the backup when the primary is a truncated or foreign value", () => {
    expect(recoverPrefs("", good)).toBe(good);
    expect(recoverPrefs({}, good)).toBe(good);
    expect(recoverPrefs({ meter: { outBytes: 1 } }, good)).toBe(good);
    expect(recoverPrefs(42, good)).toBe(good);
  });
  it("returns null when neither exists, so a fresh install still onboards", () => {
    expect(recoverPrefs(null, null)).toBeNull();
    expect(mergePrefs(recoverPrefs(null, null), 5).onboarded).toBe(false);
  });
  it("keeps the onboarding flag and the lock through the merge", () => {
    const merged = mergePrefs(recoverPrefs(undefined, good), 5);
    expect(merged.onboarded).toBe(true);
    expect(merged.lock.enabled).toBe(true);
    expect(merged.installedAt).toBe(1000);
  });
  it("isPrefsLike accepts only objects with a boolean onboarded", () => {
    expect(isPrefsLike({ onboarded: false })).toBe(true);
    expect(isPrefsLike({ onboarded: "yes" })).toBe(false);
    expect(isPrefsLike([])).toBe(false);
  });
});

describe("mergePrefs theme migration (F309: 'system' becomes 'auto')", () => {
  it("migrates a pre-round-65 'system' themeMode to 'auto'", () => {
    expect(mergePrefs({ onboarded: true, themeMode: "system" }, 5).themeMode).toBe("auto");
  });
  it("leaves 'dark' and 'light' untouched", () => {
    expect(mergePrefs({ onboarded: true, themeMode: "dark" }, 5).themeMode).toBe("dark");
    expect(mergePrefs({ onboarded: true, themeMode: "light" }, 5).themeMode).toBe("light");
  });
  it("defaults a fresh install to 'auto'", () => {
    expect(defaultPrefs(5).themeMode).toBe("auto");
  });
});
