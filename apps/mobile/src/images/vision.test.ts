import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../adapters/tauri", () => ({ isTauri: () => false }));
vi.mock("../extensions/store", () => ({ extensionUri: () => null, installExtension: async () => undefined, refreshExtension: async () => undefined }));
vi.mock("../documents/files", () => ({ registeredBlob: () => null }));

const { WASM_PHOTO_EDGE, photoEdge, photoForEngine } = await import("./vision");
const { MAX_EDGE, fitWithin } = await import("./scale");

const PNG = "data:image/jpeg;base64,/9j/AAAA";

/* F417 (round 108): a photo encoded on the CPU costs over a minute at 1024 px; half the edge is a quarter of the patches. */
describe("F417 · photos on the WASM path are encoded at 512 px", () => {
  it("512 on WASM, the stored 1024 on WebGPU", () => {
    expect(WASM_PHOTO_EDGE).toBe(512);
    expect(photoEdge(false)).toBe(512);
    expect(photoEdge(true)).toBe(MAX_EDGE);
    expect(fitWithin(1024, 768, photoEdge(false))).toEqual({ width: 512, height: 384 });
  });

  it("WASM scales the photo down before it reaches the projector", async () => {
    const scale = vi.fn(async (_b: Blob, max: number) => ({ uri: `data:image/jpeg;base64,scaled-${max}` }));
    expect(await photoForEngine(PNG, false, scale)).toBe("data:image/jpeg;base64,scaled-512");
    expect(scale).toHaveBeenCalledTimes(1);
    expect(scale.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect((scale.mock.calls[0]![0] as Blob).type).toBe("image/jpeg");
  });

  it("WebGPU keeps the photo as stored, and a photo that cannot be decoded goes as it is", async () => {
    const scale = vi.fn(async () => null);
    expect(await photoForEngine(PNG, true, scale)).toBe(PNG);
    expect(scale).not.toHaveBeenCalled();
    expect(await photoForEngine(PNG, false, scale)).toBe(PNG);
    expect(await photoForEngine("opfs://x.jpg", false, scale)).toBe("opfs://x.jpg");
  });

  it("the wllama adapter hands the projector the engine-sized photo, by its own GPU state", () => {
    const src = readFileSync(join(__dirname, "../adapters/wllama.ts"), "utf8");
    expect(src).toMatch(/photoForEngine\(uri, this\.onGpu\)/);
  });
});

describe("F417 · the card's time line uses the 512 px measurement", () => {
  it("a browser without WebGPU and no photo of its own yet is told about 88 s (F453's 512 image tokens)", async () => {
    const { MEASURED_WASM_PHOTO_MS, visionTimeHint } = await import("../extensions/timeHint");
    expect(MEASURED_WASM_PHOTO_MS).toBe(88_000);
    const t = (k: string, o?: Record<string, unknown>) => `${k}:${String(o?.seconds)}`;
    expect(visionTimeHint(t)).toBe("extensions.vision.timeHint:88");
    /* Round 117: Fast's own projector, measured the same way; a model nobody measured in a browser gets no invented number. */
    expect(visionTimeHint(t, "fast")).toBe("extensions.vision.timeHint:109");
    expect(visionTimeHint(t, "sharp")).toBeNull();
  });
});
