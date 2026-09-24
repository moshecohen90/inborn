import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { BUNDLED_MANIFEST, type CatalogModel } from "@inborn/core";

const REPO = path.resolve(__dirname, "../../..");
const CONFIG = readFileSync(path.join(REPO, "apps/mobile/app.config.ts"), "utf8");
const models = BUNDLED_MANIFEST.models;
const byId = (id: string) => models.find((m) => m.id === id) as CatalogModel;
const bundledIds = (ms: CatalogModel[]) => ms.filter((m) => m.delivery.some((d) => d.kind === "bundled")).map((m) => m.id);
const fastFollowPacks = (ms: CatalogModel[]) => ms.flatMap((m) => m.delivery.flatMap((d) => (d.kind === "play-asset-pack" && d.mode === "fast-follow" ? [d.pack] : [])));

/** The `BUNDLED_IOS_MODELS` object and the fast-follow packs of `ALL_PACKS`, read out of app.config.ts the way check-android-bundle.sh reads it. */
function configShips() {
  const ios = /const BUNDLED_IOS_MODELS = \{([^}]*)\}/.exec(CONFIG)?.[1] ?? "";
  const iosModels = Object.fromEntries([...ios.matchAll(/"?([a-z0-9-]+)"?: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const packs = /^const ALL_PACKS = \{([\s\S]*?)^\} as const;/m.exec(CONFIG)?.[1] ?? "";
  const fastFollow = [...packs.matchAll(/name: "([a-z0-9_]+)", deliveryType: "fast-follow"/g)].map((m) => m[1]);
  return { iosModels, fastFollow };
}

describe("F340/F341 · Instant's projector ships wherever Instant ships", () => {
  it("the catalog bundles it on iOS and makes it a fast-follow Play pack, like Instant", () => {
    const v = byId("vision-qwen35");
    expect(v.delivery.map((d) => d.kind)).toEqual(["bundled", "play-asset-pack", "https"]);
    expect(v.delivery.find((d) => d.kind === "play-asset-pack")).toMatchObject({ pack: "inborn_model_vision", mode: "fast-follow", file: v.file });
  });

  it("every chat model that can see and ships in the store build brings the projector along, on both stores", () => {
    const seers = models.filter((m) => m.role === "chat" && m.vision);
    const projector = models.filter((m) => m.role === "vision");
    for (const s of seers) {
      if (bundledIds([s]).length) expect(bundledIds(projector), `${s.id} is bundled`).not.toHaveLength(0);
      if (fastFollowPacks([s]).length) expect(fastFollowPacks(projector), `${s.id} is fast-follow`).not.toHaveLength(0);
    }
    /* The complement: with the projector back on demand, the rule above must fail. */
    const onDemand = projector.map((m) => ({ ...m, delivery: m.delivery.filter((d) => d.kind === "https") }));
    expect(bundledIds(onDemand)).toHaveLength(0);
    expect(fastFollowPacks(onDemand)).toHaveLength(0);
  });

  it("app.config.ts bundles exactly the catalog's `bundled` models, each under its catalog file", () => {
    const { iosModels } = configShips();
    expect(Object.keys(iosModels).sort()).toEqual(bundledIds(models).sort());
    for (const [id, file] of Object.entries(iosModels)) expect(file, id).toBe(byId(id).file);
  });

  it("app.config.ts makes exactly the catalog's fast-follow packs fast-follow", () => {
    expect(configShips().fastFollow.sort()).toEqual(fastFollowPacks(models).sort());
  });
});

/** F341 gate: `check-shipping-bundles.mjs --models` against a tiny catalog, so the red is watched without 700 MB of files. */
describe("F341 · the release gate refuses a build without the catalog's shipped models, byte for byte", () => {
  const WRAPPER = path.join(REPO, "scripts/check-shipping-bundles.mjs");
  const dir = mkdtempSync(path.join(tmpdir(), "inborn-models-"));
  const bytes = { a: Buffer.from("instant-bytes"), b: Buffer.from("projector-bytes") };
  const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  const model = (id: string, file: string, b: Buffer, pack: string) => ({ id, file, bytes: b.length, sha256: sha(b), delivery: [{ kind: "bundled", file }, { kind: "play-asset-pack", pack, mode: "fast-follow", file }] });
  const catalog = path.join(dir, "manifest.json");
  writeFileSync(catalog, JSON.stringify({ models: [model("instant", "i.gguf", bytes.a, "inborn_model"), model("vision-qwen35", "p.gguf", bytes.b, "inborn_model_vision")] }));
  const run = (target: string) => {
    try {
      return { code: 0, out: execFileSync("node", [WRAPPER, "--models", target], { encoding: "utf8", env: { ...process.env, INBORN_CATALOG: catalog } }) };
    } catch (e) {
      const err = e as { status: number; stdout: string };
      return { code: err.status, out: err.stdout };
    }
  };

  it("iOS: passes with both files at the bundle root, fails when the projector is missing or altered", () => {
    const app = path.join(dir, "Inborn.xcarchive/Products/Applications/Inborn.app");
    mkdirSync(app, { recursive: true });
    writeFileSync(path.join(app, "instant.gguf"), bytes.a);
    const missing = run(path.join(dir, "Inborn.xcarchive"));
    expect(missing.code).toBe(1);
    expect(missing.out).toContain("FAIL vision-qwen35 missing");
    writeFileSync(path.join(app, "vision-qwen35.gguf"), Buffer.from("projector-bytez"));
    expect(run(app).out).toContain("FAIL vision-qwen35 is 15 B");
    writeFileSync(path.join(app, "vision-qwen35.gguf"), bytes.b);
    expect(run(path.join(dir, "Inborn.xcarchive")).code).toBe(0);
  });

  it("Android: passes with both fast-follow packs in the AAB, fails without the projector's", () => {
    const stage = path.join(dir, "aab");
    mkdirSync(path.join(stage, "inborn_model/assets"), { recursive: true });
    mkdirSync(path.join(stage, "inborn_model_vision/assets"), { recursive: true });
    writeFileSync(path.join(stage, "inborn_model/assets/i.gguf"), bytes.a);
    const aab = path.join(dir, "app.aab");
    execFileSync("zip", ["-qr", aab, "inborn_model"], { cwd: stage });
    const red = run(aab);
    expect(red.code).toBe(1);
    expect(red.out).toContain("FAIL vision-qwen35 missing (inborn_model_vision/assets/p.gguf)");
    writeFileSync(path.join(stage, "inborn_model_vision/assets/p.gguf"), bytes.b);
    execFileSync("zip", ["-qr", aab, "inborn_model_vision"], { cwd: stage });
    expect(run(aab).code).toBe(0);
  });
});
