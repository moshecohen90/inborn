import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, DEFAULT_OPENERS, formatModelBytes, photoPlan, type PhotoPlan } from "@inborn/core";
import { photoHoldView, switchLabel } from "../src/extensions/photoCard";
import { noPassageOpeners } from "../src/lib/docsGate";

/**
 * Round 124 (F451, and F449's app side). The web, 28.9: with Fast already installed, Instant's photo hold card offered
 * "Switch to FAST" while the paid way out reads "Switch to INSTANT · 533 MB"; the free one now says its cost too.
 * F449: a documents answer with no passage opens with a sentence the app hands the prompt in the UI language.
 */
const LOCALES = join(__dirname, "../../../packages/i18n/locales");
const locales = Object.fromEntries(readdirSync(LOCALES).filter((f) => f.endsWith(".json")).map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(LOCALES, f), "utf8")) as Record<string, string>]));
const en = locales.en!;
const chat = BUNDLED_MANIFEST.models.filter((m) => m.role === "chat");
const plan = (selected: string, installed: string[]) => photoPlan({ selected, models: chat, installed: (id) => installed.includes(id) }) as Exclude<PhotoPlan, { kind: "send" }>;

describe("F451 · the free way out says it is installed", () => {
  it("switchLabel on a path with nothing missing is chat.vision.switchTo, and the English says installed", () => {
    expect(switchLabel({ model: "fast", pack: "vision-qwen35-2b", missing: [], bytes: 0 }, "Fast", formatModelBytes)).toEqual({ key: "chat.vision.switchTo", params: { seer: "Fast" } });
    expect(en["chat.vision.switchTo"]).toBe("Switch to {seer} · installed");
  });

  it("the walk's card: Instant in use without its pack, Fast and Fast's pack installed", () => {
    const v = photoHoldView(plan("instant", ["instant", "fast", "vision-qwen35-2b"]), "own", null, { count: 1, model: "Instant", seer: "Fast", size: formatModelBytes });
    expect(v.secondary).toEqual({ key: "chat.vision.switchTo", params: { seer: "Fast" } });
  });

  it("every locale carries the word after the model, in the paid label's shape", () => {
    expect(Object.keys(locales).sort()).toEqual(["de", "en", "es", "fr", "ja", "ko", "pseudo", "pt-BR", "zh-Hant"]);
    for (const [name, l] of Object.entries(locales)) {
      const free = l["chat.vision.switchTo"]!;
      const paid = l["chat.vision.switchToCost"]!;
      expect(free, name).toContain("{seer}");
      expect(free, name).toContain(" · ");
      expect(free.split(" · ")[0], name).toBe(paid.split(" · ")[0]);
      expect(free.split(" · ")[1]!.replace(/~+\]$/, "").length, name).toBeGreaterThan(1);
    }
  });
});

describe("F449 · the no-passage sentence comes in the UI language", () => {
  it("English hands the prompt exactly the sentences the Instant runs measured", () => {
    expect(noPassageOpeners((k) => en[k] ?? k)).toEqual(DEFAULT_OPENERS);
  });

  it("every locale has both sentences, each one sentence ending in its own full stop", () => {
    for (const [name, l] of Object.entries(locales)) {
      for (const key of ["documents.opener.nothingRelevant", "documents.opener.nothingFits"]) {
        const s = l[key];
        expect(s, `${name} ${key}`).toBeTruthy();
        expect(s, `${name} ${key}`).not.toContain('"');
        if (name !== "pseudo") expect(s, `${name} ${key}`).toMatch(/[.。]$/);
      }
    }
  });
});
