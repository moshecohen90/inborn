import { describe, expect, it, vi } from "vitest";
import { PERSIST_KEY, installHint, installedAsApp, lastProtection, protectStorage, storageProtected, type DurableEnv } from "./durable";

const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const CHROME_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EDGE_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";
const FIREFOX_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:140.0) Gecko/20100101 Firefox/140.0";

function local() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), map: m };
}

function env(over: Partial<DurableEnv> = {}): DurableEnv & { local: ReturnType<typeof local> } {
  return { local: local(), userAgent: CHROME_MAC, maxTouchPoints: 0, standalone: false, now: () => 1_000, ...over } as DurableEnv & { local: ReturnType<typeof local> };
}

/**
 * F411 (Moshe, 27.9): "the user must not have to install the model every time or every few days". The browser keeps an
 * origin's storage out of eviction only when asked (navigator.storage.persist), and Safari still deletes a site's data
 * after 7 days without a visit unless it is installed as an app.
 */
describe("F411 · the browser is asked to keep the model, and the answer is kept", () => {
  it("asks persist() and records the answer with why and when", async () => {
    const persist = vi.fn(async () => true);
    const e = env({ storage: { persist, persisted: async () => false } });
    expect(await protectStorage("download", e)).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(JSON.parse(e.local.map.get(PERSIST_KEY) ?? "null")).toEqual({ granted: true, reason: "download", at: 1_000 });
    expect(lastProtection(e)).toEqual({ granted: true, reason: "download", at: 1_000 });
  });

  it("a refusal is recorded too, so Settings can say the browser may clear it", async () => {
    const e = env({ storage: { persist: async () => false, persisted: async () => false } });
    expect(await protectStorage("onboarded", e)).toBe(false);
    expect(lastProtection(e)).toEqual({ granted: false, reason: "onboarded", at: 1_000 });
  });

  it("does not ask again once the browser already keeps it", async () => {
    const persist = vi.fn(async () => true);
    const e = env({ storage: { persist, persisted: async () => true } });
    expect(await protectStorage("onboarded", e)).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(lastProtection(e)?.granted).toBe(true);
  });

  it("a browser without the API answers null and nothing throws", async () => {
    const e = env({ storage: undefined });
    expect(await protectStorage("download", e)).toBeNull();
    expect(await storageProtected(e)).toBeNull();
    const throwing = env({ storage: { persist: async () => Promise.reject(new Error("denied")), persisted: async () => Promise.reject(new Error("no")) } });
    expect(await protectStorage("download", throwing)).toBeNull();
  });

  it("an unreadable record is no record", () => {
    const e = env();
    e.local.setItem(PERSIST_KEY, "{not json");
    expect(lastProtection(e)).toBeNull();
  });
});

describe("F411 · Safari is told how to keep it: install the page as an app", () => {
  it("Safari on the Mac gets the Dock hint, on the iPhone the Home Screen hint (every iOS browser is WebKit)", () => {
    expect(installHint(env({ userAgent: SAFARI_MAC }))).toBe("mac");
    expect(installHint(env({ userAgent: SAFARI_IPHONE, maxTouchPoints: 5 }))).toBe("ios");
    expect(installHint(env({ userAgent: CHROME_IOS, maxTouchPoints: 5 }))).toBe("ios");
    /* iPadOS asks for the desktop site: a Mac UA with a touch screen. */
    expect(installHint(env({ userAgent: SAFARI_MAC, maxTouchPoints: 5 }))).toBe("ios");
  });

  it("Chromium and Firefox keep a persisted origin without an install, so they get no hint", () => {
    for (const ua of [CHROME_MAC, EDGE_WIN, FIREFOX_MAC]) expect(installHint(env({ userAgent: ua })), ua).toBeNull();
  });

  it("an installed app (standalone display mode) is exempt, so the hint hides", () => {
    expect(installedAsApp(env({ standalone: true }))).toBe(true);
    expect(installHint(env({ userAgent: SAFARI_MAC, standalone: true }))).toBeNull();
    expect(installHint(env({ userAgent: SAFARI_IPHONE, maxTouchPoints: 5, standalone: true }))).toBeNull();
  });
});
