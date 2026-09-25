import { beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { BUNDLED_MANIFEST, MODELS_ORIGIN } from "@inborn/core";
import { parseCompanion } from "../src/web/modelDelivery";

/**
 * Round 93: the browser had no way to install the document index model. The embedder is now a companion in the same
 * /models/manifest.json the chat models come from, so the dev host and the CDN deliver it the same way.
 */
const repo = join(__dirname, "../../..");
const e5 = BUNDLED_MANIFEST.models.find((m) => m.id === "embed-e5")!;
let web: { webManifest: (baseUrl: string) => { models: { id: string }[]; companions?: { id: string; file: string; bytes: number; sha256: string; delivery: { kind: string; url: string }[] }[] } };
let serve: {
  modelSha256: (file: string) => string;
  modelsManifest: (o: { dist: string; modelsDir: string; aliases: Record<string, string>; modelsOrigin?: string; indexOrigin?: string }) => { companions?: { id: string; bytes: number; sha256: string; delivery: { url: string }[] }[] };
  resolveFile: (url: string, o: { dist: string; modelsDir: string; aliases: Record<string, string>; deployedLike?: boolean }) => string | null;
};

beforeAll(async () => {
  web = (await import(/* @vite-ignore */ join(repo, "scripts/web-manifest.mjs"))) as typeof web;
  serve = (await import(/* @vite-ignore */ join(repo, "scripts/serve-web.mjs"))) as typeof serve;
});

describe("round 93 · the document index model is in the browser catalog", () => {
  it("the deployed manifest lists it as a companion, never as a chat model", () => {
    const m = web.webManifest(`${MODELS_ORIGIN}/v1`);
    expect(m.models.map((x) => x.id)).not.toContain("embed-e5");
    const c = m.companions?.find((x) => x.id === "embed-e5");
    expect(c).toMatchObject({ file: e5.file, bytes: e5.bytes, sha256: e5.sha256 });
    expect(c!.delivery[0]!.url).toBe(`${MODELS_ORIGIN}/v1/${e5.file}`);
  });

  it("the app reads it back from that manifest, and only from an allowed origin", () => {
    const m = web.webManifest(`${MODELS_ORIGIN}/v1`);
    expect(parseCompanion(m, "embed-e5", [MODELS_ORIGIN], "https://app.inbornapp.com")).toMatchObject({ id: "embed-e5", file: e5.file, bytes: e5.bytes, url: `${MODELS_ORIGIN}/v1/${e5.file}` });
    expect(parseCompanion(m, "embed-e5", [], "https://app.inbornapp.com")).toBeNull();
    expect(parseCompanion({ companions: [] }, "embed-e5", [MODELS_ORIGIN], "https://app.inbornapp.com")).toBeNull();
  });

  it("the dev host serves the local file as that companion, same-origin", () => {
    const dir = mkdtempSync(join(tmpdir(), "inborn-e5-"));
    writeFileSync(join(dir, e5.file), "not really a gguf");
    const m = serve.modelsManifest({ dist: "", modelsDir: dir, aliases: {} });
    expect(m.companions?.find((c) => c.id === "embed-e5")?.delivery[0]!.url).toBe(`/models/${e5.file}`);
    const none = serve.modelsManifest({ dist: "", modelsDir: mkdtempSync(join(tmpdir(), "inborn-none-")), aliases: {} });
    expect(none.companions ?? []).toEqual([]);
  });

  /* The local e5 file's sidecar was written by `shasum -a 256` ("<hash>  <name>"); the host handed that whole line out
     as the sha256, and the browser's verified download failed "The file did not verify" (round 93 first after-run). */
  it("reads a shasum-style sidecar as the bare hash", () => {
    const dir = mkdtempSync(join(tmpdir(), "inborn-sha-"));
    const file = join(dir, "m.gguf");
    writeFileSync(file, "x");
    writeFileSync(`${file}.sha256`, `${"a".repeat(64)}  m.gguf\n`);
    expect(serve.modelSha256(file)).toBe("a".repeat(64));
  });

  it("INDEX_ORIGIN lists the CDN copy with the catalog's bytes and hash, with no local file", () => {
    const m = serve.modelsManifest({ dist: "", modelsDir: mkdtempSync(join(tmpdir(), "inborn-none-")), aliases: {}, indexOrigin: MODELS_ORIGIN });
    expect(m.companions?.find((c) => c.id === "embed-e5")).toMatchObject({ bytes: e5.bytes, sha256: e5.sha256, delivery: [{ url: `${MODELS_ORIGIN}/v1/${e5.file}` }] });
  });

  /* F1: app.inbornapp.com answers a model it does not hold with the SPA shell, 200 text/html; the dev host can now do the same. */
  it("a deployed-like host answers the shell for the index model and keeps serving the chat aliases", () => {
    const dist = mkdtempSync(join(tmpdir(), "inborn-dist-"));
    writeFileSync(join(dist, "index.html"), "<!DOCTYPE html>");
    const models = mkdtempSync(join(tmpdir(), "inborn-models-"));
    writeFileSync(join(models, e5.file), "GGUF");
    writeFileSync(join(models, "q.gguf"), "GGUF");
    const o = { dist, modelsDir: models, aliases: { "instant.gguf": "q.gguf" }, deployedLike: true };
    expect(serve.resolveFile(`/models/${e5.file}`, o)).toBe(join(dist, "index.html"));
    expect(serve.resolveFile("/models/instant.gguf", o)).toBe(join(models, "q.gguf"));
    expect(serve.resolveFile("/anything.gguf", o)).toBe(join(dist, "index.html"));
    expect(serve.resolveFile(`/models/${e5.file}`, { ...o, deployedLike: false })).toBe(join(models, e5.file));
  });
});
