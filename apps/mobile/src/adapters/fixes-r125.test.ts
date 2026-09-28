import { afterEach, describe, expect, it, vi } from "vitest";
import { visionPackFor } from "@inborn/core";

const loads: Record<string, unknown>[] = [];

vi.mock("@wllama/wllama/esm/index.js", () => ({
  Wllama: class {
    static getLibllamaVersion = () => "test";
    setCompat() {}
    async loadModelFromUrl(_model: unknown, params: Record<string, unknown>) {
      loads.push(params);
    }
    getNumThreads = () => 1;
    supportInputModality = () => true;
    async exit() {}
  },
  LoggerWithoutDebug: {},
  LogLevel: {},
}));

afterEach(() => {
  loads.length = 0;
  vi.unstubAllGlobals();
});

async function projectorLoad(modelId: string, gpu: boolean): Promise<Record<string, unknown>> {
  vi.stubGlobal("navigator", { hardwareConcurrency: 4, ...(gpu ? { gpu: { requestAdapter: async () => ({}) } } : {}) });
  const { WllamaLM } = await import("./wllama");
  const lm = new WllamaLM();
  await lm.load({ id: modelId, uri: `https://inborn.test/${modelId}.gguf` }, { nCtx: 4096 });
  expect(await lm.enableVision("https://inborn.test/mmproj.gguf")).toBe(true);
  return loads.at(-1)!;
}

describe("F453 · Instant reads photo text on the browser CPU path", () => {
  it("the catalog's packs are the ones the rule names", () => {
    expect(visionPackFor("instant")?.id).toBe("vision-qwen35");
    expect(visionPackFor("fast")?.id).toBe("vision-qwen35-2b");
    expect(visionPackFor("sharp")?.id).toBe("vision-qwen35-4b");
  });

  it("Instant's pack on the CPU gets at least 512 image tokens, the cap unchanged", async () => {
    const { visionParams } = await import("./wllama");
    expect(visionParams("vision-qwen35", false)).toEqual({ image_max_tokens: 512, image_min_tokens: 512 });
  });

  it("Instant's pack on WebGPU gets no minimum: its 1024 px photo is already ~494 tokens", async () => {
    const { visionParams } = await import("./wllama");
    expect(visionParams("vision-qwen35", true)).toEqual({ image_max_tokens: 512 });
  });

  it("Fast's and Sharp's packs get no minimum on either path", async () => {
    const { visionParams } = await import("./wllama");
    for (const pack of ["vision-qwen35-2b", "vision-qwen35-4b"]) {
      expect(visionParams(pack, false)).toEqual({ image_max_tokens: 512 });
      expect(visionParams(pack, true)).toEqual({ image_max_tokens: 512 });
    }
  });

  it("the projector load hands wllama the minimum for Instant on the CPU", async () => {
    const params = await projectorLoad("instant", false);
    expect(params).toMatchObject({ n_gpu_layers: 0, image_max_tokens: 512, image_min_tokens: 512 });
  });

  it("the projector load leaves the minimum out for Instant on WebGPU and for Fast on the CPU", async () => {
    const gpu = await projectorLoad("instant", true);
    expect(gpu.n_gpu_layers).toBeGreaterThan(0);
    expect(gpu).not.toHaveProperty("image_min_tokens");
    const fast = await projectorLoad("fast", false);
    expect(fast).toMatchObject({ n_gpu_layers: 0, image_max_tokens: 512 });
    expect(fast).not.toHaveProperty("image_min_tokens");
  });

  it("a text-only load carries no image params", async () => {
    vi.stubGlobal("navigator", { hardwareConcurrency: 4 });
    const { WllamaLM } = await import("./wllama");
    await new WllamaLM().load({ id: "instant", uri: "https://inborn.test/instant.gguf" }, { nCtx: 4096 });
    expect(loads.at(-1)).not.toHaveProperty("image_max_tokens");
    expect(loads.at(-1)).not.toHaveProperty("image_min_tokens");
  });
});
