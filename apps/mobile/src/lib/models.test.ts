import { describe, expect, it } from "vitest";
import { describeLoad, importDisplayName, meterLabel, modelLabel } from "./models";

describe("modelLabel", () => {
  it("catalog ids keep their friendly names", () => {
    expect(modelLabel("instant")).toBe("INSTANT");
    expect(modelLabel("sharp-phi")).toBe("SHARP (PHI)");
    expect(modelLabel("null")).toBe("DEV");
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
