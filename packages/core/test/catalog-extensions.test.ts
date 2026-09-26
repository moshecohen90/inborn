import { afterEach, describe, expect, it } from "vitest";
import {
  BUNDLED_MANIFEST,
  extensionAppliesTo,
  extensionBundledOn,
  extensions,
  extensionsForAttachment,
  extensionsForFeature,
  extensionUrl,
  findExtension,
  httpsUrl,
  registerExtension,
  type Extension,
} from "../src";

/* F406 (round 105): one registry for every on-demand extension; the catalog and the registry must never disagree. */
let undo: (() => void) | null = null;
afterEach(() => {
  undo?.();
  undo = null;
});

describe("F406 · the extension registry", () => {
  it("carries the document index first (kind index, words fallback) and the photo projector second (kind vision, no fallback)", () => {
    expect(extensions().map((e) => [e.id, e.kind, e.fallback])).toEqual([
      ["embed-e5", "index", "words"],
      ["vision-qwen35", "vision", null],
    ]);
  });

  it("agrees with the signed catalog on file, size, hash and CDN path for every entry that is also a catalog model", () => {
    for (const ext of extensions()) {
      const m = BUNDLED_MANIFEST.models.find((x) => x.id === ext.id);
      expect(m, ext.id).toBeDefined();
      expect({ file: ext.file, bytes: ext.bytes, sha256: ext.sha256 }, ext.id).toEqual({ file: m!.file, bytes: m!.bytes, sha256: m!.sha256 });
      expect(extensionUrl(ext, BUNDLED_MANIFEST.baseUrl), ext.id).toBe(httpsUrl(BUNDLED_MANIFEST, m!));
    }
  });

  it("the projector is 204,987,232 bytes and at models.inbornapp.com/v1/", () => {
    const v = findExtension("vision-qwen35")!;
    expect(v.bytes).toBe(204_987_232);
    expect(extensionUrl(v, BUNDLED_MANIFEST.baseUrl)).toBe("https://models.inbornapp.com/v1/mmproj-Qwen3.5-0.8B-F16.gguf");
  });

  it("ships the projector inside the iOS and Android apps and nowhere else; the index ships nowhere", () => {
    const v = findExtension("vision-qwen35")!;
    const e5 = findExtension("embed-e5")!;
    expect(["ios", "android", "web", "desktop"].filter((p) => extensionBundledOn(v, p as never))).toEqual(["ios", "android"]);
    expect(e5.bundledOn).toEqual([]);
  });

  it("matches an attachment by kind, MIME or file extension", () => {
    const v = findExtension("vision-qwen35")!;
    expect(extensionAppliesTo(v, { kind: "photo" })).toBe(true);
    expect(extensionAppliesTo(v, { kind: "document", mime: "image/png" })).toBe(true);
    expect(extensionAppliesTo(v, { kind: "document", name: "IMG_0001.HEIC" })).toBe(true);
    expect(extensionAppliesTo(v, { kind: "document", mime: "application/pdf", name: "a.pdf" })).toBe(false);
    expect(extensionsForAttachment({ kind: "photo" }).map((e) => e.id)).toEqual(["vision-qwen35"]);
    expect(extensionsForAttachment({ kind: "document", name: "notes.txt" }).map((e) => e.id)).toEqual(["embed-e5"]);
    expect(extensionsForFeature("documents-ask").map((e) => e.id)).toEqual(["embed-e5"]);
  });

  it("a third extension is one registry entry: it appears in every query and leaves again", () => {
    const fake: Extension = { id: "ocr-fake", kind: "ocr", file: "ocr.gguf", bytes: 1234, sha256: "0".repeat(64), path: "ocr.gguf", appliesTo: { mime: ["application/pdf"], features: ["scan"] }, bundledOn: [], fallback: null };
    undo = registerExtension(fake);
    expect(extensions().map((e) => e.id)).toEqual(["embed-e5", "vision-qwen35", "ocr-fake"]);
    expect(extensionsForAttachment({ kind: "document", mime: "application/pdf" }).map((e) => e.id)).toContain("ocr-fake");
    expect(extensionsForFeature("scan")).toEqual([fake]);
    undo();
    undo = null;
    expect(findExtension("ocr-fake")).toBeUndefined();
  });
});
