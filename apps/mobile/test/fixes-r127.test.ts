import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANSWER_CEILING, BUNDLED_MANIFEST } from "@inborn/core";
import { PHONE_IMAGE_MAX_TOKENS, phoneImageMaxTokens } from "../src/adapters/imageTokens";

/*
 * Round 127. Fine text in photos (handwriting, chalk) failed at 512 image tokens and read at 1024 on Fast; the phone's
 * contexts are 4096 tokens for Fast and Sharp (both need 6 GB), so a 1024-token photo plus the answer still fits.
 */
describe("image tokens per phone model", () => {
  it("Instant stays at 512, Fast and Sharp spend 1024", () => {
    expect(phoneImageMaxTokens("instant")).toBe(512);
    expect(phoneImageMaxTokens("fast")).toBe(1024);
    expect(phoneImageMaxTokens("sharp")).toBe(1024);
  });

  it("an imported file or no model at all falls back to 512", () => {
    expect(phoneImageMaxTokens("import:Qwen3.5-2B-Q4_K_M.gguf")).toBe(512);
    expect(phoneImageMaxTokens(undefined)).toBe(512);
  });

  it("every capped model is a catalog chat model that sees photos", () => {
    for (const id of Object.keys(PHONE_IMAGE_MAX_TOKENS)) {
      const m = BUNDLED_MANIFEST.models.find((x) => x.id === id);
      expect(m?.role).toBe("chat");
      expect(m?.vision).toBe(true);
    }
  });

  it("a 1024-token photo, the answer ceiling and the reply reserve fit the 4096 context the 6 GB tier loads with", () => {
    for (const id of ["fast", "sharp"]) {
      expect(BUNDLED_MANIFEST.models.find((x) => x.id === id)!.minRamGB).toBeGreaterThanOrEqual(6);
      expect(4096 - phoneImageMaxTokens(id) - ANSWER_CEILING).toBeGreaterThanOrEqual(2048);
    }
  });

  it("llama.rn reads the cap from the one map, not a literal", () => {
    const src = readFileSync(join(__dirname, "../src/adapters/llamaRn.ts"), "utf8");
    expect(src).toMatch(/image_max_tokens: imageMaxTokens/);
    expect(src).not.toMatch(/image_max_tokens: \d/);
  });
});
