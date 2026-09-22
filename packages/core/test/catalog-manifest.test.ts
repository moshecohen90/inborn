import { describe, expect, it } from "vitest";
import * as ed from "@noble/ed25519";
import {
  BUNDLED_MANIFEST,
  CATALOG_PUBLIC_KEY,
  ENGINE_VERSION,
  canonicalJson,
  deliverySources,
  findModel,
  httpsUrl,
  loadManifest,
  manifestBytes,
  modelParts,
  publicKeyFromPrivate,
  signManifest,
  unsignedManifest,
  verifyManifest,
  type CatalogManifest,
  type CatalogModel,
} from "../src/index";

const PRIV = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

describe("canonicalJson", () => {
  it("sorts keys at every level, drops undefined and ignores formatting", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[3,{"y":2,"z":1}]},"b":1}');
    expect(canonicalJson("é")).toBe('"é"');
    expect(canonicalJson(null)).toBe("null");
  });
});

describe("signed manifest", () => {
  it("the bundled manifest verifies with the committed public key", () => {
    expect(verifyManifest(BUNDLED_MANIFEST, CATALOG_PUBLIC_KEY)).toBe(true);
    expect(loadManifest(BUNDLED_MANIFEST)).toEqual({ ok: true, manifest: BUNDLED_MANIFEST });
  });

  it("any edit after signing is rejected", () => {
    const tampered: CatalogManifest = { ...BUNDLED_MANIFEST, models: BUNDLED_MANIFEST.models.map((m) => (m.id === "fast" ? { ...m, sha256: "00".repeat(32) } : m)) };
    expect(verifyManifest(tampered, CATALOG_PUBLIC_KEY)).toBe(false);
    expect(loadManifest(tampered)).toEqual({ ok: false, problem: "bad-signature" });
    const reordered = JSON.parse(JSON.stringify({ ...BUNDLED_MANIFEST, models: [...BUNDLED_MANIFEST.models].reverse() })) as CatalogManifest;
    expect(verifyManifest(reordered, CATALOG_PUBLIC_KEY)).toBe(false);
  });

  it("rejects a manifest signed by another key, an empty signature and garbage", () => {
    const unsigned = unsignedManifest(BUNDLED_MANIFEST);
    const other = signManifest(unsigned, PRIV);
    expect(verifyManifest(other, CATALOG_PUBLIC_KEY)).toBe(false);
    expect(verifyManifest(other, publicKeyFromPrivate(PRIV))).toBe(true);
    expect(verifyManifest({ ...BUNDLED_MANIFEST, signature: "" }, CATALOG_PUBLIC_KEY)).toBe(false);
    expect(verifyManifest({ ...BUNDLED_MANIFEST, signature: "zz".repeat(64) }, CATALOG_PUBLIC_KEY)).toBe(false);
  });

  it("signature bytes exclude the signature field itself and match RFC 8032 through noble", () => {
    const unsigned = unsignedManifest(BUNDLED_MANIFEST);
    expect(manifestBytes(BUNDLED_MANIFEST)).toEqual(manifestBytes(unsigned));
    const sig = signManifest(unsigned, PRIV).signature;
    expect(ed.verify(sig, manifestBytes(unsigned), publicKeyFromPrivate(PRIV))).toBe(true);
  });

  it("only allow-listed hosts may serve https deliveries, even with a valid signature", () => {
    const unsigned = unsignedManifest(BUNDLED_MANIFEST);
    const pub = publicKeyFromPrivate(PRIV);
    expect(loadManifest(signManifest({ ...unsigned, baseUrl: "https://evil.example.com/v1" }, PRIV), pub)).toEqual({ ok: false, problem: "host-not-allowed" });
    expect(loadManifest(signManifest({ ...unsigned, baseUrl: "http://models.inbornapp.com/v1" }, PRIV), pub)).toEqual({ ok: false, problem: "host-not-allowed" });
    expect(loadManifest(signManifest({ ...unsigned, baseUrl: "http://127.0.0.1:8790/v1" }, PRIV), pub, ["127.0.0.1"]).ok).toBe(true);
    expect(loadManifest(signManifest({ ...unsigned, schema: 2 as 1 }, PRIV), pub)).toEqual({ ok: false, problem: "unsupported-schema" });
  });
});

describe("bundled catalog content (spec §6.1, §6.2)", () => {
  it("carries the three chat tiers, the Phi alternative, embeddings, speech and vision, all runnable by this engine", () => {
    const ids = BUNDLED_MANIFEST.models.map((m) => m.id);
    expect(ids).toEqual(["instant", "fast", "sharp", "sharp-phi", "embed-nomic", "speech-whisper-base", "vision-qwen35"]);
    for (const m of BUNDLED_MANIFEST.models) {
      expect(m.sha256, m.id).toMatch(/^[0-9a-f]{64}$/);
      expect(m.bytes, m.id).toBeGreaterThan(0);
      expect(m.minEngine, m.id).toBeLessThanOrEqual(ENGINE_VERSION);
      expect(m.minRamGB, m.id).toBeLessThanOrEqual(m.recommendedRamGB);
    }
    expect(findModel(BUNDLED_MANIFEST, "instant")?.delivery.map((d) => d.kind)).toEqual(["bundled", "play-asset-pack", "https"]);
    expect(findModel(BUNDLED_MANIFEST, "fast")?.delivery[0]).toEqual({ kind: "play-asset-pack", pack: "inborn_model_fast", mode: "on-demand", file: "Qwen3.5-2B-Q4_K_M.gguf" });
    /* The vault finds a delivered pack by the catalog file name, so every pack/bundled entry must use it (asset names in app.config.ts too). */
    /* A bundled file is the model file; a Play pack carries the model file or one of its shards (one pack per shard, §5.1). */
    for (const m of BUNDLED_MANIFEST.models) {
      for (const d of m.delivery) {
        if (d.kind === "bundled") expect(d.file, m.id).toBe(m.file);
        if (d.kind === "play-asset-pack") expect(modelParts(m).map((p) => p.file), m.id).toContain(d.file);
      }
      const packs = m.delivery.filter((d) => d.kind === "play-asset-pack");
      if (packs.length) expect(packs.map((d) => d.file).sort(), m.id).toEqual(modelParts(m).map((p) => p.file).sort());
    }
    expect(findModel(BUNDLED_MANIFEST, "sharp")?.proOnly).toBe(true);
    expect(httpsUrl(BUNDLED_MANIFEST, findModel(BUNDLED_MANIFEST, "fast")!)).toBe("https://models.inbornapp.com/v1/Qwen3.5-2B-Q4_K_M.gguf");
  });

  it("split models list every shard; single files are one part; shard URLs sit next to the first one", () => {
    const fast = findModel(BUNDLED_MANIFEST, "fast")!;
    expect(modelParts(fast)).toEqual([{ file: fast.file, bytes: fast.bytes, sha256: fast.sha256 }]);
    const split: CatalogModel = {
      ...fast,
      file: "m-00001-of-00002.gguf",
      bytes: 30,
      parts: [
        { file: "m-00001-of-00002.gguf", bytes: 20, sha256: "a".repeat(64) },
        { file: "m-00002-of-00002.gguf", bytes: 10, sha256: "b".repeat(64) },
      ],
      delivery: [{ kind: "https", path: "sharp/m-00001-of-00002.gguf" }],
    };
    expect(modelParts(split).map((p) => p.file)).toEqual(["m-00001-of-00002.gguf", "m-00002-of-00002.gguf"]);
    expect(modelParts(split).reduce((n, p) => n + p.bytes, 0)).toBe(split.bytes);
    expect(httpsUrl(BUNDLED_MANIFEST, split, split.parts![1])).toBe("https://models.inbornapp.com/v1/sharp/m-00002-of-00002.gguf");
    expect(httpsUrl(BUNDLED_MANIFEST, split)).toBe("https://models.inbornapp.com/v1/sharp/m-00001-of-00002.gguf");
    for (const m of BUNDLED_MANIFEST.models) if (m.parts) expect(m.parts.reduce((n, p) => n + p.bytes, 0), m.id).toBe(m.bytes);
  });
});

/*
 * QA F46: the Details sheet listed the raw delivery kinds, so Sharp read "play-asset-pack, play-asset-pack, https"
 * on an iPhone — a Play source on a device that has no Play, and the same source twice because the model is split.
 */
describe("deliverySources (QA F46)", () => {
  const sharp = findModel(BUNDLED_MANIFEST, "sharp")!;
  const fast = findModel(BUNDLED_MANIFEST, "fast")!;
  const instant = findModel(BUNDLED_MANIFEST, "instant")!;
  it("leaves Play out on iOS and names each source once", () => {
    expect(sharp.delivery.filter((d) => d.kind === "play-asset-pack")).toHaveLength(2);
    expect(deliverySources(sharp, "ios")).toEqual(["https"]);
    expect(deliverySources(fast, "ios")).toEqual(["https"]);
    expect(deliverySources(instant, "ios")).toEqual(["bundled", "https"]);
  });
  it("keeps Play on Android, deduped, in manifest order", () => {
    expect(deliverySources(sharp, "android")).toEqual(["play", "https"]);
    expect(deliverySources(instant, "android")).toEqual(["bundled", "play", "https"]);
  });
  it("leaves Play out on the web and on a desktop", () => {
    for (const os of ["web", "macos", "windows", "linux"] as const) expect(deliverySources(sharp, os)).toEqual(["https"]);
  });
  it("maps an Apple pack to Apple only on Apple platforms, and a Hugging Face file to hf", () => {
    const apple = { ...fast, delivery: [{ kind: "apple-asset-pack", pack: "p" }, ...fast.delivery] } as CatalogModel;
    expect(deliverySources(apple, "ios")).toEqual(["apple", "https"]);
    expect(deliverySources(apple, "macos")).toEqual(["apple", "https"]);
    expect(deliverySources(apple, "android")).toEqual(["play", "https"]);
    const hf = { ...fast, delivery: [{ kind: "hf", repo: "a/b", revision: "main", path: "m.gguf" }] } as CatalogModel;
    expect(deliverySources(hf, "ios")).toEqual(["hf"]);
  });
  it("names only sources the vault has a label for", () => {
    for (const m of BUNDLED_MANIFEST.models) for (const os of ["ios", "android", "web"] as const) for (const v of deliverySources(m, os)) expect(["bundled", "play", "apple", "https", "hf", "import"]).toContain(v);
  });
});
