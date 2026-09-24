import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST } from "@inborn/core";
import { chosenSource, webDeviceProfile, webModelChoices } from "./modelChoice";
import type { DeviceGate } from "./deviceGate";
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

  it("means best for this device, not already downloaded", () => {
    expect(recommended(gate(), ["instant"])).toBe(recommended(gate()));
    expect(webModelChoices({ sources: SOURCES, gate: gate(), installed: ["instant"], languageCode: "en" }).find((c) => c.source.id === "instant")?.installed).toBe(true);
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
