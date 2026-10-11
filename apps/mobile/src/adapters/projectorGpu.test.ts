import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectorOnGpu } from "./projectorGpu";

describe("the picture projector's backend (vc30 SIGSEGV on Adreno OpenCL)", () => {
  it("runs on the CPU on every Android phone", () => {
    expect(projectorOnGpu("android", true)).toBe(false);
    expect(projectorOnGpu("android", false)).toBe(false);
  });

  it("keeps Metal on a real iPhone and the CPU on the simulator", () => {
    expect(projectorOnGpu("ios", true)).toBe(true);
    expect(projectorOnGpu("ios", false)).toBe(false);
  });

  it("is what the llama.rn adapter hands initMultimodal", () => {
    const src = readFileSync(join(__dirname, "llamaRn.ts"), "utf8");
    expect(src).toMatch(/initMultimodal\(\{[^}]*use_gpu: projectorOnGpu\(Platform\.OS, isDevice\)/);
  });
});
