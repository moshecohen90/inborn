import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chipLabel, describeLoad, importDisplayName, meterLabel, modelLabel } from "./models";

describe("modelLabel", () => {
  it("catalog ids keep their friendly names", () => {
    expect(modelLabel("instant")).toBe("INSTANT");
    expect(modelLabel("sharp-phi")).toBe("SHARP (PHI)");
    /* F273: the no-model engine used to answer "DEV" here, and that literal reached the header chip in every language. */
    expect(modelLabel("null")).not.toBe("DEV");
  });
  it("imports show the file's model name, never the raw id", () => {
    expect(modelLabel("import:Qwen3.5-0.8B-Q4_K_M.gguf")).toBe("QWEN3.5-0.8B");
    expect(modelLabel("import:Qwen3-0.6B-Q8_0.gguf")).toBe("QWEN3-0.6B");
    expect(modelLabel("import:gemma-3n-E2B-it-f16.gguf")).toBe("GEMMA-3N-E2B-IT");
  });
});

describe("importDisplayName", () => {
  it("strips prefix, extension and quant tag", () => {
    expect(importDisplayName("import:Phi-4-mini-instruct-Q4_K_M.gguf")).toBe("Phi-4-mini-instruct");
    expect(importDisplayName("import:Llama-3.2-1B-Instruct-IQ4_XS.gguf")).toBe("Llama-3.2-1B-Instruct");
    expect(importDisplayName("import:my_model.gguf")).toBe("my model");
  });
  it("keeps a name that is only a quant tag", () => {
    expect(importDisplayName("import:Q4_K_M.gguf")).toBe("Q4 K M");
  });
});

describe("describeLoad (QA F16)", () => {
  it("names the engine, the model and the file", () => {
    expect(describeLoad("llama.rn", "instant", "file:///x/instant.gguf", 1498)).toBe("[inborn] llama.rn loaded model INSTANT (instant) from file:///x/instant.gguf in 1498 ms");
  });
  it("says nothing for the no-model engine", () => {
    expect(describeLoad("null", "null", "bundled://null", 90)).toBeNull();
    expect(describeLoad("llama.rn", "null", "bundled://null", 90)).toBeNull();
  });
});

describe("meterLabel (QA F25)", () => {
  it("names the loaded model", () => {
    expect(meterLabel("instant", "No model on this device")).toBe("INSTANT");
    expect(meterLabel("import:Phi-4-mini-instruct-Q4_K_M.gguf", "No model on this device")).toBe("PHI-4-MINI-INSTRUCT");
  });
  it("says no model instead of printing the null engine's id", () => {
    expect(meterLabel("null", "No model on this device")).toBe("No model on this device");
    expect(meterLabel("null", "Kein Modell auf diesem Gerät")).toBe("Kein Modell auf diesem Gerät");
  });
});

/**
 * F273. `NAMES.null = "DEV"` put the literal DEV in the header chip, the sidebar chip and the line under the seal
 * on the empty chat, which is exactly the state a first-time browser reader sees. Every chip that can be handed the
 * no-model engine asks for the wording, in their language, the way the drawer's meter already did.
 */
describe("chipLabel (F273)", () => {
  const t = ((key: string) => (key === "onboarding.model.none" ? "No model on this browser" : key)) as (k: string) => string;

  it("says the localized no-model wording rather than a developer's placeholder", () => {
    expect(chipLabel(t, "null")).toBe("No model on this browser");
    expect(chipLabel(((k: string) => (k === "onboarding.model.none" ? "Kein Modell in diesem Browser" : k)) as typeof t, "null")).toBe("Kein Modell in diesem Browser");
  });

  it("still names a real model, catalog or imported", () => {
    expect(chipLabel(t, "instant")).toBe("INSTANT");
    expect(chipLabel(t, "import:Qwen3-0.6B-Q8_0.gguf")).toBe("QWEN3-0.6B");
  });

  /* The complement: no locale may hand the chip the English placeholder back, or the fix would be English-only. */
  it("every locale translates the wording the chip falls back to", () => {
    const dir = join(__dirname, "../../../../packages/i18n/locales");
    const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8")) as Record<string, string>;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && x !== "en.json" && x !== "pseudo.json")) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, string>;
      expect(d["onboarding.model.none"], f).toBeTruthy();
      expect(d["onboarding.model.none"], f).not.toBe(en["onboarding.model.none"]);
    }
  });
});
