import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** F380: the browser's lock and privacy lines must not promise encryption or app-switcher hiding it does not have. */
const dir = join(__dirname, "../../../packages/i18n/locales");
const LOCALES = ["en", "de", "es", "fr", "ja", "ko", "pt-BR", "zh-Hant"];
const load = (l: string) => JSON.parse(readFileSync(join(dir, `${l}.json`), "utf8")) as Record<string, string>;
const WEB_KEYS = ["lock.lockedExplain.web", "lock.lockedExplainPasscode.web", "lock.explain.web", "lock.explain.passcode.web", "settings.security.hideInSwitcher.web", "storage.chats.browser", "storage.models.web"];

describe("F380 · web copy tells the truth", () => {
  it.each(LOCALES)("%s has every web line, and the biometric ones keep their placeholder", (l) => {
    const d = load(l);
    for (const k of WEB_KEYS) expect(d[k], `${l} ${k}`).toBeTruthy();
    expect(d["lock.lockedExplain.web"]).toContain("{biometric}");
    expect(d["lock.explain.web"]).toContain("{biometric}");
    /* The web line must differ from the native promise it replaces. */
    expect(d["lock.lockedExplainPasscode.web"]).not.toBe(d["lock.lockedExplainPasscode"]);
    expect(d["lock.explain.passcode.web"]).not.toBe(d["lock.explain.passcode"]);
    expect(d["settings.security.hideInSwitcher.web"]).not.toBe(d["settings.security.hideInSwitcher.sub"]);
  });

  it("English web lines say what the browser does", () => {
    const en = load("en");
    expect(en["lock.lockedExplainPasscode.web"]).not.toMatch(/stay encrypted/);
    expect(en["lock.lockedExplainPasscode.web"]).toMatch(/not encrypted/);
    expect(en["lock.explain.passcode.web"]).not.toMatch(/app switcher/);
    expect(en["storage.chats.browser"]).toMatch(/IndexedDB/);
  });

  it("the screens pick the web lines on web", () => {
    const src = (p: string) => readFileSync(join(__dirname, "../src", p), "utf8");
    expect(src("lock/LockScreen.tsx")).toMatch(/Platform\.OS === "web" && storageKind !== "sqlcipher" \? "\.web"/);
    expect(src("screens/Onboarding/LockOffer.tsx")).toMatch(/lock\.explain\.passcode\$\{web\}/);
    expect(src("screens/Settings/Settings.tsx")).toMatch(/settings\.security\.hideInSwitcher\.web/);
    expect(src("screens/Settings/Storage.tsx")).toMatch(/storage\.chats\.browser/);
  });
});
