import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MODELS_ORIGIN, findExtension } from "@inborn/core";
import { parseCompanion } from "../src/web/modelDelivery";

/* F406/F407 (round 105): the browser catalog carries every extension; the photo projector is the second one. */
const repo = join(__dirname, "../../..");
const vision = findExtension("vision-qwen35")!;
type Companion = { id: string; kind: string; role: string; file: string; bytes: number; sha256: string; delivery: { kind: string; url: string }[] };
let web: { webManifest: (baseUrl: string) => { models: { id: string }[]; companions: Companion[] } };
let serve: { modelsManifest: (o: { dist: string; modelsDir: string; aliases: Record<string, string>; indexOrigin?: string }) => { companions: Companion[] } };

beforeAll(async () => {
  web = (await import(/* @vite-ignore */ join(repo, "scripts/web-manifest.mjs"))) as typeof web;
  serve = (await import(/* @vite-ignore */ join(repo, "scripts/serve-web.mjs"))) as typeof serve;
});

describe("F406 · the deployed catalog lists both extensions at the CDN", () => {
  it("index first, projector second, each with its kind, never as a chat model", () => {
    const m = web.webManifest(`${MODELS_ORIGIN}/v1`);
    expect(m.companions.map((c) => [c.id, c.kind])).toEqual([
      ["embed-e5", "index"],
      ["vision-qwen35", "vision"],
    ]);
    expect(m.models.map((x) => x.id)).not.toContain("vision-qwen35");
    expect(m.companions[1]).toMatchObject({ file: vision.file, bytes: 204_987_232, sha256: vision.sha256, delivery: [{ kind: "cdn", url: `${MODELS_ORIGIN}/v1/${vision.file}` }] });
    expect(parseCompanion(m, "vision-qwen35", [MODELS_ORIGIN], "https://app.inbornapp.com")?.url).toBe(`${MODELS_ORIGIN}/v1/${vision.file}`);
  });
  it("the dev host serves the local projector same-origin, and INDEX_ORIGIN points every extension at one origin", () => {
    const dir = mkdtempSync(join(tmpdir(), "inborn-mmproj-"));
    writeFileSync(join(dir, vision.file), "GGUF");
    expect(serve.modelsManifest({ dist: "", modelsDir: dir, aliases: {} }).companions.map((c) => [c.id, c.delivery[0]!.url])).toEqual([["vision-qwen35", `/models/${vision.file}`]]);
    const far = serve.modelsManifest({ dist: "", modelsDir: dir, aliases: {}, indexOrigin: "http://127.0.0.1:9" });
    expect(far.companions.map((c) => c.delivery[0]!.url)).toEqual([`http://127.0.0.1:9/v1/${findExtension("embed-e5")!.path}`, `http://127.0.0.1:9/v1/${vision.path}`]);
  });
});

describe("F407/F408 · the browser copy", () => {
  const en = JSON.parse(readFileSync(join(repo, "packages/i18n/locales/en.json"), "utf8")) as Record<string, string>;
  it("the door, onboarding and the model sheet say photos come with the photo pack, not only in the app", () => {
    expect(en["models.copy.instant.goodForNoPhotos"]).toMatch(/photo pack/);
    expect(en["models.copy.instant.goodForNoPhotos"]).not.toMatch(/in the app/);
    expect(en["vault.details.visionWeb"]).toMatch(/photo pack/);
  });
  it("the attach sheet's Photo row is open in a browser whose model can see", () => {
    const chat = readFileSync(join(__dirname, "../src/screens/Chat.tsx"), "utf8");
    expect(chat).toContain("photoDisabled={webPhotos ? !modelSees : !visionReady || !modelSees}");
    expect(chat).toContain('t("chat.attach.photoWebPack", { size: visionSize })');
  });
  it("the Model step says extensions come later, on demand", () => {
    expect(readFileSync(join(__dirname, "../src/web/ModelOffer.tsx"), "utf8")).toContain('t("web.download.extensionsLater")');
    expect(en["web.download.extensionsLater"]).toMatch(/^Only the text model downloads now\./);
  });
});
