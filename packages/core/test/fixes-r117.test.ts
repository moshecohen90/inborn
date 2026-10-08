import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, extensions, extensionsForAttachment, findExtension, photoPath, photoPlan, visionPackFor, type CatalogModel, type PhotoPlan } from "../src";

/**
 * Round 117 (F437). Moshe on the web, Fast selected, attached a photo: the card offered the 205 MB photo pack, which is
 * Instant's projector; after that download it said "Fast can't see photos. Instant can", and switching asked for Instant
 * itself (533 MB). Two downloads, the first useless to his selection. A projector is built for one model's embedding
 * width, so the resolver answers per selected model, and every path it offers carries its whole cost.
 */
const byId = (id: string) => BUNDLED_MANIFEST.models.find((m) => m.id === id) as CatalogModel;
const chat = BUNDLED_MANIFEST.models.filter((m) => m.role === "chat");
const INSTANT = 532_517_120;
const INSTANT_PACK = 204_987_232;
const FAST_PACK = 668_227_264;
const SHARP_PACK = 672_423_616;

const plan = (selected: string, installed: string[]): PhotoPlan => photoPlan({ selected, models: chat, installed: (id) => installed.includes(id) });
const ids = (p: PhotoPlan): string[] => JSON.stringify(p).match(/"(vision-[a-z0-9-]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];

describe("F437 · a photo is offered the pack of the model that will look at it", () => {
  it("Fast selected, fresh: one pack, Fast's own, 668 MB; never Instant's 205 MB projector", () => {
    const p = plan("fast", ["fast"]);
    expect(p.kind).toBe("pack");
    if (p.kind !== "pack") return;
    expect(p.path).toEqual({ model: "fast", pack: "vision-qwen35-2b", missing: [{ id: "vision-qwen35-2b", kind: "pack", bytes: FAST_PACK }], bytes: FAST_PACK });
    expect(ids(p)).not.toContain("vision-qwen35");
    /* Instant would cost 533 MB + 205 MB = 738 MB, more than Fast's own pack: not offered. */
    expect(p.alt).toBeNull();
  });

  it("the attachment query takes the model: a photo on Fast needs Fast's pack and nothing else", () => {
    expect(extensionsForAttachment({ kind: "photo" }, "fast").map((e) => e.id)).toEqual(["vision-qwen35-2b"]);
    expect(extensionsForAttachment({ kind: "photo" }, "instant").map((e) => e.id)).toEqual(["vision-qwen35"]);
    expect(extensionsForAttachment({ kind: "photo" }, "sharp").map((e) => e.id)).toEqual(["vision-qwen35-4b"]);
    expect(extensionsForAttachment({ kind: "photo" }, "sharp-phi").map((e) => e.id)).toEqual([]);
    expect(visionPackFor("fast")?.id).toBe("vision-qwen35-2b");
    expect(visionPackFor("sharp-phi")).toBeUndefined();
  });

  it("the switch-to-Instant path reports Instant's full missing cost, model + pack, as one number", () => {
    const path = photoPath(byId("instant"), () => false)!;
    expect(path.missing).toEqual([
      { id: "instant", kind: "model", bytes: INSTANT },
      { id: "vision-qwen35", kind: "pack", bytes: INSTANT_PACK },
    ]);
    expect(path.bytes).toBe(INSTANT + INSTANT_PACK);
  });

  it("Moshe's browser after the bug (Instant's pack already downloaded): Instant is offered at 533 MB, less than Fast's pack", () => {
    const p = plan("fast", ["fast", "vision-qwen35"]);
    expect(p.kind === "pack" && p.alt).toEqual({ model: "instant", pack: "vision-qwen35", missing: [{ id: "instant", kind: "model", bytes: INSTANT }], bytes: INSTANT });
  });

  it("on a phone, where Instant and its pack come with the app, the alternative costs nothing", () => {
    const p = plan("fast", ["fast", "instant", "vision-qwen35"]);
    expect(p.kind === "pack" && p.alt).toMatchObject({ model: "instant", missing: [], bytes: 0 });
  });

  it("Sharp has its own 672 MB pack; Sharp (Phi) has none and is offered one step to the cheapest model that sees", () => {
    const sharp = plan("sharp", ["sharp"]);
    expect(sharp.kind === "pack" && sharp.path).toMatchObject({ pack: "vision-qwen35-4b", bytes: SHARP_PACK });
    const phi = plan("sharp-phi", ["sharp-phi"]);
    expect(phi).toEqual({ kind: "switch", alt: { model: "instant", pack: "vision-qwen35", missing: [{ id: "instant", kind: "model", bytes: INSTANT }, { id: "vision-qwen35", kind: "pack", bytes: INSTANT_PACK }], bytes: INSTANT + INSTANT_PACK } });
    expect(plan("sharp-phi", ["sharp-phi", "instant", "vision-qwen35"])).toMatchObject({ kind: "switch", alt: { model: "instant", bytes: 0 } });
  });

  it("a way out through a file this host cannot deliver is never offered", () => {
    const p = photoPlan({ selected: "fast", models: chat, installed: (id) => ["fast", "vision-qwen35"].includes(id), available: (id) => id !== "instant" });
    expect(p.kind === "pack" && p.alt).toBeNull();
  });

  it("with the selected model's pack installed there is no card: the photo sends", () => {
    expect(plan("fast", ["fast", "vision-qwen35-2b"]).kind).toBe("send");
    expect(plan("instant", ["instant", "vision-qwen35"]).kind).toBe("send");
  });

  it("nothing that sees is offered here (the desktop shell, an imported model with no catalog seer): none", () => {
    expect(photoPlan({ selected: "imported-x", models: [], installed: () => true }).kind).toBe("none");
    expect(photoPlan({ selected: "sharp-phi", models: [byId("sharp-phi")], installed: () => true }).kind).toBe("none");
  });
});

describe("F437 · the catalog and the registry agree on who sees", () => {
  it("every chat model that claims vision has exactly one pack built for it; Sharp (Phi) claims none", () => {
    for (const m of chat) {
      const packs = extensions().filter((e) => e.kind === "vision" && e.appliesTo.models?.includes(m.id));
      expect({ id: m.id, packs: packs.length }).toEqual({ id: m.id, packs: m.vision ? 1 : 0 });
    }
    expect(chat.filter((m) => m.vision).map((m) => m.id)).toEqual(["instant", "fast", "sharp"]);
    expect(byId("sharp-phi").vision).toBe(false);
  });

  it("the two new packs are the upstream F16 projectors, downloaded on demand everywhere, same bytes and hash as the catalog", () => {
    expect(findExtension("vision-qwen35-2b")).toMatchObject({ file: "mmproj-Qwen3.5-2B-F16.gguf", bytes: FAST_PACK, sha256: "7035e9cb8d7c6a9681d07eef9a364783e86ea4cd73faab2eabb4f43a101830c7", path: "mmproj-Qwen3.5-2B-F16.gguf", bundledOn: [] });
    expect(findExtension("vision-qwen35-4b")).toMatchObject({ file: "mmproj-Qwen3.5-4B-F16.gguf", bytes: SHARP_PACK, sha256: "cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864", path: "mmproj-Qwen3.5-4B-F16.gguf", bundledOn: [] });
    for (const id of ["vision-qwen35-2b", "vision-qwen35-4b"]) {
      expect(byId(id).role).toBe("vision");
      expect(byId(id).delivery.find((d) => d.kind === "https")).toEqual({ kind: "https", path: findExtension(id)!.file });
    }
    /* Android has no INTERNET permission, so Fast's pack also comes as an on-demand Play pack; Sharp's is not shipped there. */
    expect(byId("vision-qwen35-2b").delivery[0]).toEqual({ kind: "play-asset-pack", pack: "inborn_model_vision_fast", mode: "on-demand", file: "mmproj-Qwen3.5-2B-F16.gguf" });
    expect(byId("vision-qwen35-4b").delivery).toHaveLength(1);
    expect(findExtension("vision-qwen35")!.bundledOn).toEqual(["ios", "android"]);
  });
});

/* Round 134Q (F463): on Android Fast's 668 MB pack has no Play asset pack, so its Download could never arrive. */
describe("F463 · the selected model's own pack is offered only when this host can deliver it", () => {
  const notFastPack = (id: string) => id !== "vision-qwen35-2b";
  it("own pack undeliverable, Instant ready: switch to Instant at no cost", () => {
    const p = photoPlan({ selected: "fast", models: chat, installed: (id) => ["fast", "instant", "vision-qwen35"].includes(id), available: notFastPack });
    expect(p).toEqual({ kind: "switch", alt: { model: "instant", pack: "vision-qwen35", missing: [], bytes: 0 } });
  });
  it("own pack undeliverable and no other way that this host can deliver: none", () => {
    expect(photoPlan({ selected: "fast", models: chat, installed: (id) => id === "fast", available: () => false }).kind).toBe("none");
  });
  it("own pack deliverable: the 668 MB pack as before", () => {
    const p = photoPlan({ selected: "fast", models: chat, installed: (id) => ["fast", "instant", "vision-qwen35"].includes(id), available: () => true });
    expect(p.kind === "pack" && p.path.bytes).toBe(FAST_PACK);
    expect(p.kind === "pack" && p.alt).toMatchObject({ model: "instant", bytes: 0 });
  });
});
