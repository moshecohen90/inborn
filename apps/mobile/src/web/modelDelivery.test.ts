import { describe, expect, it } from "vitest";
import { parseManifest, pickModel, type WebModelSource } from "./modelDelivery";

const ORIGIN = "https://app.inbornapp.com";
const m = (id: string, tier: WebModelSource["tier"], bytes: number, url = `/models/${id}.gguf`, extra = {}) => ({ id, tier, file: `${id}.gguf`, bytes, delivery: [{ kind: "cdn", url }], ...extra });

describe("parseManifest", () => {
  it("keeps same-origin and allow-listed CDN models, drops every other host", () => {
    const models = parseManifest(
      { models: [m("instant", "instant", 100), m("fast", "fast", 200, "https://models.inbornapp.com/fast.gguf", { sha256: "AB" }), m("evil", "sharp", 300, "https://example.com/x.gguf"), { id: "pad", tier: "fast", file: "p.gguf", bytes: 1, delivery: [{ kind: "play-asset-pack" }] }] },
      ["https://models.inbornapp.com"],
      ORIGIN,
    );
    expect(models.map((x) => x.id)).toEqual(["instant", "fast"]);
    expect(models[1]).toMatchObject({ url: "https://models.inbornapp.com/fast.gguf", sha256: "AB", name: "fast" });
  });
  it("ignores rows without a file or size", () => {
    expect(parseManifest({ models: [{ id: "x", file: "", bytes: 0, delivery: [{ kind: "cdn", url: "/models/x.gguf" }] }] }, [], ORIGIN)).toEqual([]);
    expect(parseManifest({}, [], ORIGIN)).toEqual([]);
  });
});

describe("pickModel", () => {
  const list = parseManifest({ models: [m("sharp", "sharp", 2700), m("instant", "instant", 533), m("fast-b", "fast", 1400), m("fast-a", "fast", 1280)] }, [], ORIGIN);
  it("takes the biggest tier the gate allows, smaller file on a tie", () => {
    expect(pickModel(list, "sharp")?.id).toBe("sharp");
    expect(pickModel(list, "fast")?.id).toBe("fast-a");
    expect(pickModel(list, "instant")?.id).toBe("instant");
  });
  it("is undefined when nothing fits", () => {
    expect(pickModel(list.filter((x) => x.tier === "sharp"), "instant")).toBeUndefined();
  });
});
