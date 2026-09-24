import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST } from "@inborn/core";
import { chosenSource, webDeviceProfile, webLanguageUpgrade, webModelChoices, webSheetChoices } from "./modelChoice";
import { classifyDevice, type DeviceGate } from "./deviceGate";
import type { WebModelSource } from "./modelDelivery";

/* The real catalog, cut the way scripts/web-manifest.mjs cuts it: a chat model, free, one file, reachable over https. */
const SOURCES: WebModelSource[] = BUNDLED_MANIFEST.models
  .filter((m) => m.role === "chat" && !m.proOnly && !m.parts && m.delivery.some((d) => d.kind === "https"))
  .map((m) => ({ id: m.id, tier: m.tier!, name: m.name, file: m.file, bytes: m.bytes, url: `/models/${m.id}.gguf` }));

const gate = (over: Partial<DeviceGate> = {}): DeviceGate => ({ formFactor: "desktop", maxTier: "sharp", ramGB: 8, cores: 8, iphone: false, webgpu: false, ...over });
const ids = (g: DeviceGate, installed: string[] = []) => webModelChoices({ sources: SOURCES, gate: g, installed, languageCode: "en" }).map((c) => c.source.id);
const recommended = (g: DeviceGate, installed: string[] = []) => webModelChoices({ sources: SOURCES, gate: g, installed, languageCode: "en" }).find((c) => c.recommended)?.source.id;

describe("F311 · the browser door offers a choice, best for this device first", () => {
  it("offers the two free single-file chat models and neither Pro one, so the choice is real and sellable", () => {
    expect(SOURCES.map((s) => s.id)).toEqual(["instant", "fast"]);
    /* Sharp is split across two files and Sharp (Phi) is Pro; the browser tier can neither stitch nor sell. */
    expect(BUNDLED_MANIFEST.models.filter((m) => m.role === "chat").map((m) => m.id)).toContain("sharp-phi");
  });

  it("recommends the biggest tier the browser can actually run, and lists the rest", () => {
    expect(recommended(gate())).toBe("fast");
    expect(ids(gate())).toEqual(["fast", "instant"]);
  });

  it("offers a phone only Instant: §14.3 is a gate, not a preference", () => {
    expect(ids(gate({ formFactor: "phone", maxTier: "instant", ramGB: 4 }))).toEqual(["instant"]);
    expect(recommended(gate({ formFactor: "phone", maxTier: "instant", ramGB: 4 }))).toBe("instant");
  });

  it("reads cores when the browser hides its memory: many cores earn Fast, few get Instant with Fast still on the list", () => {
    const many = gate({ ramGB: null, cores: 10, maxTier: "fast" });
    const few = gate({ ramGB: null, cores: 2, maxTier: "fast" });
    expect(recommended(many)).toBe("fast");
    expect(recommended(few)).toBe("instant");
    expect(ids(few)).toContain("fast");
    expect(webDeviceProfile(many).ramGB).toBe(6);
    expect(webDeviceProfile(few).ramGB).toBe(4);
  });

  it("never recommends a model the §6.3 RAM floor rules out, but still lets the reader take it", () => {
    const small = gate({ ramGB: 4, maxTier: "fast" });
    expect(recommended(small)).toBe("instant");
    expect(ids(small)).toEqual(["instant", "fast"]);
  });

  /* Two models that differ in nothing but their tier, so the only thing that can move the tag is the installed flag. */
  it("means best for this device, not already downloaded", () => {
    const base = BUNDLED_MANIFEST.models.find((m) => m.id === "instant")!;
    const twins = [
      { ...base, id: "small", tier: "instant" as const, bytes: 1 },
      { ...base, id: "big", tier: "fast" as const, bytes: 2 },
    ];
    const sources: WebModelSource[] = twins.map((m) => ({ id: m.id, tier: m.tier, name: m.id, file: `${m.id}.gguf`, bytes: m.bytes, url: `/models/${m.id}.gguf` }));
    const pick = (installed: string[]) => webModelChoices({ sources, gate: gate(), installed, languageCode: "en", catalog: twins }).find((c) => c.recommended)?.source.id;
    expect(pick([])).toBe("big");
    expect(pick(["small"])).toBe("big");
    expect(webModelChoices({ sources, gate: gate(), installed: ["small"], languageCode: "en", catalog: twins }).find((c) => c.source.id === "small")?.installed).toBe(true);
  });

  it("carries the numbers the card prints, from the catalog and the §6.4 table", () => {
    const [top] = webModelChoices({ sources: SOURCES, gate: gate(), languageCode: "en" });
    expect(top!.source.bytes).toBe(BUNDLED_MANIFEST.models.find((m) => m.id === top!.source.id)!.bytes);
    expect(top!.speed).toEqual([4, 15]);
    expect(top!.languages.length).toBeGreaterThan(0);
  });

  it("keeps the reader's pick and falls back to the recommendation when it is gone", () => {
    const choices = webModelChoices({ sources: SOURCES, gate: gate(), languageCode: "en" });
    expect(chosenSource(choices, "instant")?.id).toBe("instant");
    expect(chosenSource(choices, "sharp-phi")?.id).toBe("fast");
    expect(chosenSource(choices, null)?.id).toBe("fast");
    expect(chosenSource([], "instant")).toBeNull();
  });
});

describe("F345 · the chat's Model sheet on the browser names the door's recommendation", () => {
  /* What the door holds after a reader took the smaller model: Instant loaded, Fast recommended (I14, wave 2). */
  const door = (g: DeviceGate, installed: string[] = ["instant"]) => webModelChoices({ sources: SOURCES, gate: g, installed, languageCode: "en" });
  const sheet = (g: DeviceGate, over: { languageCode?: string | null; use?: "chat" | "code" } = {}) =>
    webSheetChoices({ choices: door(g), gate: g, use: over.use ?? "chat", languageCode: over.languageCode === undefined ? "en" : over.languageCode, currentId: "instant" });
  const doorPick = (g: DeviceGate) => door(g).find((c) => c.recommended)?.source.id;

  it("recommends what the door recommends, on every browser the gate can describe, even with the other model loaded", () => {
    const gates = [gate(), gate({ ramGB: null, cores: 10, maxTier: "fast" }), gate({ ramGB: null, cores: 2, maxTier: "fast" }), gate({ ramGB: 4, maxTier: "fast" }), gate({ formFactor: "tablet", ramGB: null, cores: 8, maxTier: "fast" }), gate({ formFactor: "phone", maxTier: "instant", ramGB: 4 })];
    for (const g of gates) expect(sheet(g).recommended?.model.id, JSON.stringify(g)).toBe(doorPick(g));
    expect(sheet(gate()).recommended?.model.id).toBe("fast");
  });

  it("offers every model the door offers as a choice on this browser, and nothing it offers is 'In the app'", () => {
    const s = sheet(gate());
    expect([...s.installed, ...s.available].map((c) => c.model.id).sort()).toEqual(door(gate()).map((c) => c.source.id).sort());
    expect(s.available.map((c) => c.model.id)).toEqual(["fast"]);
    expect(s.installed.map((c) => c.model.id)).toEqual(["instant"]);
    expect([...s.installed, ...s.available].every((c) => !c.blocked)).toBe(true);
    expect(s.unavailable).toEqual([]);
  });

  it("keeps 'In the app' for what the browser is never offered: the Pro and split Sharp models", () => {
    expect(sheet(gate()).inTheApp.map((c) => c.model.id)).toEqual(["sharp", "sharp-phi"]);
    /* A phone's browser runs Instant only, so Fast belongs to the app there, and says so. */
    expect(sheet(gate({ formFactor: "phone", maxTier: "instant", ramGB: 4 })).inTheApp.map((c) => c.model.id)).toEqual(["fast", "sharp", "sharp-phi"]);
    expect(sheet(gate()).inTheApp.every((c) => !c.blocked)).toBe(true);
  });

  it("still follows this chat's language and task, from the same ranking, among what the browser can run", () => {
    const he = sheet(gate(), { languageCode: "he" });
    expect(he.recommendedWeak).toBe(true);
    expect(["instant", "fast"]).toContain(he.recommended?.model.id);
    expect(he.recommended?.model.id).toBe(webModelChoices({ sources: SOURCES, gate: gate(), languageCode: "he" }).find((c) => c.recommended)?.source.id);
  });
});

describe("F346 · the site's browser rule is the gate's rule", () => {
  const offers = (userAgent: string, over: Partial<Parameters<typeof classifyDevice>[0]> = {}) =>
    webModelChoices({ sources: SOURCES, gate: classifyDevice({ userAgent, webgpu: false, ...over }), languageCode: "en" }).map((c) => c.source.id);
  const site = readFileSync(join(__dirname, "../../../site/src/i18n/en.json"), "utf8");
  it("says Fast is for capable computers and tablets, because the gate offers it on both and never on a phone", () => {
    expect(site).toContain("(Fast, on capable computers and tablets)");
    expect(site).not.toContain("capable desktops");
    expect(offers("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", { deviceMemoryGB: 8, hardwareConcurrency: 8 })).toContain("fast");
    expect(offers("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", { maxTouchPoints: 5, hardwareConcurrency: 8 })).toContain("fast");
    expect(offers("Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36", { hardwareConcurrency: 8 })).toContain("fast");
    expect(offers("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36", { deviceMemoryGB: 8, hardwareConcurrency: 8 })).toEqual(["instant"]);
  });
});

describe("F346 · the browser chat's language notice names a model this browser runs", () => {
  const choicesFor = (g: DeviceGate) => webModelChoices({ sources: SOURCES, gate: g, installed: ["instant"], languageCode: "en" });
  const upgrade = (g: DeviceGate, languageCode: string) => webLanguageUpgrade({ choices: choicesFor(g), gate: g, use: "chat", languageCode, currentId: "instant" });
  it("a Spanish chat on Instant is offered Fast, which this browser runs and rates Spanish good", () => {
    for (const code of ["es", "fr", "it", "ja", "ru", "ar"]) {
      const u = upgrade(gate(), code);
      expect(u?.better.model.id, code).toBe("fast");
      expect(u?.from, code).toBe("basic");
      expect(u?.better.reason.installed, code).toBe(false);
    }
  });
  it("offers nothing when nothing here does better: Hebrew (none on both), or a phone browser that runs Instant only", () => {
    expect(upgrade(gate(), "he")).toBeNull();
    expect(upgrade(gate({ formFactor: "phone", maxTier: "instant", ramGB: 4 }), "es")).toBeNull();
  });
  it("then the sheet's own pick is weak, which is the only case the chat says nothing here is good at it", () => {
    const g = gate();
    const sheetFor = (languageCode: string) => webSheetChoices({ choices: choicesFor(g), gate: g, use: "chat", languageCode, currentId: "instant" });
    expect(sheetFor("es").recommendedWeak).toBe(false);
    expect(sheetFor("he").recommendedWeak).toBe(true);
  });
});
