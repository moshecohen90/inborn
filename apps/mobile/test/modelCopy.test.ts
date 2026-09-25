import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUNDLED_MANIFEST } from "@inborn/core";
import { modelCopy } from "../src/lib/models";

const locales = join(__dirname, "../../../packages/i18n/locales");
const load = (f: string) => JSON.parse(readFileSync(join(locales, f), "utf8")) as Record<string, string>;
const en = load("en.json");
const t = (dict: Record<string, string>) => (key: string, options?: Record<string, unknown>) => dict[key] ?? String(options?.defaultValue ?? key);

describe("catalog copy has a locale key", () => {
  it("en.json repeats every goodFor and weakAt of the signed manifest word for word", () => {
    for (const m of BUNDLED_MANIFEST.models) {
      if (m.goodFor) expect(en[`models.copy.${m.id}.goodFor`], m.id).toBe(m.goodFor);
      if (m.fit?.weakAt) expect(en[`models.copy.${m.id}.weakAt`], m.id).toBe(m.fit.weakAt);
    }
  });
  it("resolves the user's language and never leaves a raw key on screen", () => {
    const ja = load("ja.json");
    const instant = BUNDLED_MANIFEST.models.find((m) => m.id === "instant")!;
    expect(modelCopy(t(ja), instant)).toEqual({ goodFor: ja["models.copy.instant.goodFor"], weakAt: ja["models.copy.instant.weakAt"] });
    expect(modelCopy(t(ja), instant).goodFor).not.toBe(instant.goodFor);
  });
  it("falls back to the manifest line for an imported file, which has no key", () => {
    const imported = { id: "import:Qwen3.5-0.8B-Q4_K_M.gguf", goodFor: "Imported by you.", fit: { weakAt: "Unknown." } };
    expect(modelCopy(t(load("zh-Hant.json")), imported)).toEqual({ goodFor: "Imported by you.", weakAt: "Unknown." });
  });
  it("shows nothing where the catalog says nothing", () => {
    expect(modelCopy(t(en), { id: "import:x.gguf", goodFor: "" })).toEqual({ goodFor: "", weakAt: "" });
  });
  /* F385: where no engine can see (the browser), the only-model-that-sees-photos claim is replaced in every locale. */
  it("drops the photo claim where photos cannot be read, in every locale", () => {
    const instant = BUNDLED_MANIFEST.models.find((m) => m.id === "instant")!;
    for (const f of ["en", "de", "es", "fr", "ja", "ko", "pt-BR", "zh-Hant", "pseudo"]) {
      const dict = load(`${f}.json`);
      const line = modelCopy(t(dict), instant, { photos: false }).goodFor;
      expect(line, f).toBe(dict["models.copy.instant.goodForNoPhotos"]);
      expect(line, f).not.toBe(dict["models.copy.instant.goodFor"]);
    }
    expect(modelCopy(t(en), instant, { photos: false }).goodFor).not.toMatch(/only model here/);
    expect(modelCopy(t(en), instant).goodFor).toBe(en["models.copy.instant.goodFor"]);
  });
});
