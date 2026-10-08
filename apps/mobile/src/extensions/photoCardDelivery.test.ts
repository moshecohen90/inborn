import { describe, expect, it } from "vitest";
import { formatModelBytes, photoPlan, type PhotoPlan } from "@inborn/core";
import { photoHoldView, type HeldPhoto } from "./photoCard";

/*
 * Android 1.0.0 (29), Fast selected with a photo: the card offered Fast's 668 MB pack, the tap failed as `no-delivery`,
 * and the card then said "Google Play is not available here. Import a model file instead." under a Try again, on a phone
 * that installed the app from Play and has no INTERNET permission to import with.
 */
const models = [
  { id: "instant", bytes: 532_517_120, vision: true },
  { id: "fast", bytes: 1_280_835_840, vision: true },
];
const ON_PHONE = new Set(["instant", "vision-qwen35", "fast"]);
const plan = (deliverable: (id: string) => boolean): PhotoPlan => photoPlan({ selected: "fast", models, installed: (id) => ON_PHONE.has(id), available: deliverable });
const opts = { count: 1, model: "FAST", seer: "INSTANT", size: formatModelBytes };
const held = (p: PhotoPlan) => p as HeldPhoto;
const noDelivery = { kind: "failed" as const, error: "no-delivery", bytes: 668_227_264 };

describe("the photo card offers only what this phone can do", () => {
  it("Fast's pack comes through Play: the card offers that one download with its size, nothing that fails", () => {
    const p = plan(() => true);
    expect(p).toMatchObject({ kind: "pack", path: { pack: "vision-qwen35-2b", bytes: 668_227_264 } });
    const v = photoHoldView(held(p), "own", { kind: "missing", bytes: 668_227_264 }, opts);
    expect(v.title).toEqual({ key: "chat.vision.packTitle", params: { model: "FAST" } });
    expect(v.primary).toEqual({ action: "download", label: { key: "chat.vision.download", params: { size: formatModelBytes(668_227_264) } } });
    expect(v.error).toBeNull();
  });

  it("the download runs on the card with its progress", () => {
    const v = photoHoldView(held(plan(() => true)), "own", { kind: "downloading", bytes: 334_113_632, total: 668_227_264 }, opts);
    expect(v.progress).toBe(0.5);
    expect(v.primary).toBeNull();
  });

  it("Play cannot bring the pack: Instant reads the photo here, the switch is the button, no Try again and no Play blame", () => {
    const v = photoHoldView(held(plan(() => true)), "own", noDelivery, opts);
    expect(v.title).toEqual({ key: "chat.vision.holdTitleModel", params: { model: "FAST" } });
    expect(v.body).toEqual({ key: "chat.vision.packNotHere", params: { seer: "INSTANT", model: "FAST" } });
    expect(v.primary).toEqual({ action: "switch", label: { key: "chat.vision.switchTo", params: { seer: "INSTANT" } } });
    expect(v.secondary).toBeNull();
    expect(v.caption).toBeNull();
    expect(v.error).toBeNull();
    expect(v.cancel.key).toBe("extensions.vision.cancel");
  });

  it("Play itself is absent on the device: the card says so, and still offers the switch", () => {
    const v = photoHoldView(held(plan(() => true)), "own", noDelivery, { ...opts, storeReachable: false });
    expect(v.error).toBe("no-delivery");
    expect(v.primary?.action).toBe("switch");
  });

  it("no way out at all: the card says Fast cannot look at photos here and offers only Remove the photo", () => {
    const alone = photoPlan({ selected: "fast", models, installed: (id) => id === "fast", available: () => true });
    const v = photoHoldView(held({ ...alone, alt: null } as PhotoPlan), "own", noDelivery, opts);
    expect(v.body).toEqual({ key: "chat.attach.noVisionHere", params: { model: "FAST" } });
    expect(v.primary).toBeNull();
    expect(v.error).toBeNull();
  });

  it("a pack Play cannot serve is never offered: the plan is the switch to Instant", () => {
    const p = plan((id) => id !== "vision-qwen35-2b");
    expect(p).toEqual({ kind: "switch", alt: { model: "instant", pack: "vision-qwen35", missing: [], bytes: 0 } });
    expect(photoHoldView(held(p), "own", null, opts).primary?.action).toBe("switch");
  });

  it("an ordinary failure keeps its Try again", () => {
    const v = photoHoldView(held(plan(() => true)), "own", { kind: "failed", error: "verify", bytes: 1 }, opts);
    expect(v.primary?.action).toBe("retry");
  });

  it("every locale carries the two new lines with the placeholders the card fills", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const loc of ["en", "de", "fr", "es", "pt-BR", "ja", "ko", "zh-Hant"]) {
      const json = JSON.parse(readFileSync(join(__dirname, `../../../../packages/i18n/locales/${loc}.json`), "utf8")) as Record<string, string>;
      expect(json["chat.vision.packNotHere"], loc).toMatch(/\{seer\}.*\{model\}/s);
      expect(json["chat.vision.noStore"], loc).toContain("Google Play");
      expect(`${json["chat.vision.packNotHere"]} ${json["chat.vision.noStore"]}`.toLowerCase(), loc).not.toMatch(/import|importe|インポート|読み込|가져오|匯入/);
    }
  });
});
