import { beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MODELS_ORIGIN } from "@inborn/core";
import { MANIFEST_URL, parseManifest } from "../src/web/modelDelivery";

/**
 * B1 (MosheAI, 24.9.2026). `https://app.inbornapp.com/models/manifest.json` answered 200 text/html, byte-identical
 * to index.html: only the dev server ever built that file, the deploy never wrote one, and the origin's
 * single-page-application fallback turned the missing catalog into the app's own document. A browser could not
 * install a model at all, and said "No model on this browser" while the CDN happily served the GGUF.
 */
const repo = join(__dirname, "../../..");
type CatalogModel = { id: string; role?: string; proOnly?: boolean; parts?: unknown[] };
type Catalog = { models: CatalogModel[] };
let web: {
  webManifest: (baseUrl: string, catalog?: unknown) => { models: { id: string; tier: string; file: string; bytes: number; sha256: string; delivery: { kind: string; url: string }[] }[] };
  webEligible: (catalog?: unknown) => { id: string }[];
  catalogProblem: (r: { status?: number; contentType?: string; body?: string }) => string | null;
  readCatalog: () => Catalog;
  MANIFEST_REL: string;
};
let serve: { modelsManifest: (o: { dist: string; modelsDir: string; aliases: Record<string, string>; modelsOrigin?: string }) => { models: { id: string }[] } };

beforeAll(async () => {
  web = (await import(/* @vite-ignore */ join(repo, "scripts/web-manifest.mjs"))) as typeof web;
  serve = (await import(/* @vite-ignore */ join(repo, "scripts/serve-web.mjs"))) as typeof serve;
});

describe("F270 · the deployed origin carries the browser tier's catalog", () => {
  it("the build writes it at the path the app fetches", () => {
    expect(`/${web.MANIFEST_REL}`).toBe(MANIFEST_URL);
    const build = readFileSync(join(repo, "apps/web/build.mjs"), "utf8");
    expect(build).toContain("MANIFEST_REL");
    expect(build).toContain("webManifest(");
  });

  it("names a model the browser can actually install, from the CDN", () => {
    const manifest = web.webManifest(`${MODELS_ORIGIN}/v1`);
    expect(manifest.models.length).toBeGreaterThan(0);
    for (const m of manifest.models) {
      expect(m.delivery[0]).toMatchObject({ kind: "cdn" });
      expect(new URL(m.delivery[0]!.url).origin, m.id).toBe(MODELS_ORIGIN);
      expect(m.sha256, m.id).toMatch(/^[0-9a-f]{64}$/);
      expect(m.bytes, m.id).toBeGreaterThan(0);
    }
  });

  /* The app drops anything it cannot fetch; a manifest that survives its own parser is the only useful one. */
  it("survives the app's own parser with every model intact", () => {
    const manifest = web.webManifest(`${MODELS_ORIGIN}/v1`);
    const parsed = parseManifest(manifest as never, [MODELS_ORIGIN], "https://app.inbornapp.com");
    expect(parsed.map((m) => m.id)).toEqual(manifest.models.map((m) => m.id));
  });

  /* A split model has no downloader in the browser (the OPFS worker fetches one file) and a Pro model has no
     way to be bought there: offering either would be the same dead end in a different place. */
  it("offers only free, single-file chat models", () => {
    const catalog = web.readCatalog();
    const eligible = web.webEligible(catalog).map((m) => m.id);
    expect(eligible).toEqual(catalog.models.filter((m) => m.role === "chat" && !m.proOnly && !m.parts).map((m) => m.id));
    for (const m of catalog.models) if (m.parts ?? m.proOnly ?? m.role !== "chat") expect(eligible, m.id).not.toContain(m.id);
  });

  it("the dev server answers with the built file when this machine holds no model", () => {
    const dist = mkdtempSync(join(tmpdir(), "inborn-dist-"));
    mkdirSync(join(dist, "models"), { recursive: true });
    writeFileSync(join(dist, web.MANIFEST_REL), JSON.stringify(web.webManifest(`${MODELS_ORIGIN}/v1`)));
    const served = serve.modelsManifest({ dist, modelsDir: join(dist, "nothing-here"), aliases: { "instant.gguf": "instant.gguf" } });
    expect(served.models.map((m) => m.id)).toEqual(web.webManifest(`${MODELS_ORIGIN}/v1`).models.map((m) => m.id));
  });
});

describe("F272 · the deploy refuses to call a broken catalog a deploy", () => {
  const ok = JSON.stringify({ models: [{ id: "instant" }] });

  it("passes only a JSON body that lists a model", () => {
    expect(web.catalogProblem({ status: 200, contentType: "application/json; charset=utf-8", body: ok })).toBeNull();
  });

  /* The complement, which is the whole point: the shape B1 shipped answers 200 and must still fail. */
  it("fails the SPA shell, a wrong type, an unparsable body, an empty catalog and a non-200", () => {
    const shell = '<!DOCTYPE html>\n<html lang="en">\n  <head>';
    expect(web.catalogProblem({ status: 200, contentType: "text/html", body: shell })).toMatch(/SPA shell/);
    expect(web.catalogProblem({ status: 200, contentType: "text/plain", body: ok })).toMatch(/not JSON/);
    expect(web.catalogProblem({ status: 200, contentType: "application/json", body: "{oops" })).toMatch(/unparsable/);
    expect(web.catalogProblem({ status: 200, contentType: "application/json", body: '{"models":[]}' })).toMatch(/no model/);
    expect(web.catalogProblem({ status: 404, contentType: "application/json", body: ok })).toBe("404");
  });

  /* The catalog check rides in round 57's live gate, which the deploy runs after --app and exits non-zero on. */
  it("the deploy runs that gate and fails on it", () => {
    const deploy = readFileSync(join(repo, "scripts/deploy-cloudflare.mjs"), "utf8");
    expect(deploy).toContain("scripts/check-live.mjs");
    expect(deploy).toMatch(/the live check failed[\s\S]{0,120}process\.exit\(1\)/);
  });

  /* Run for real against an origin that answers the way B1's origin did, and against one that answers properly. */
  it("passes a real catalog and fails the SPA shell, as a process, with the reason on stderr", async () => {
    const catalog = JSON.stringify(web.webManifest(`${MODELS_ORIGIN}/v1`));
    const shell = '<!DOCTYPE html>\n<html lang="en"><head></head><body></body></html>';
    const serve = (body: string, type: string) =>
      createServer((req, res) => {
        const isCatalog = (req.url ?? "").startsWith(`/${web.MANIFEST_REL}`);
        res.writeHead(200, { "Content-Type": isCatalog ? type : "text/html; charset=utf-8", "Cache-Control": "no-cache, no-transform" }).end(isCatalog ? body : shell);
      });
    const run = async (body: string, type: string): Promise<{ code: number | null; err: string }> => {
      const server = serve(body, type);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      try {
        return await new Promise((resolve) => {
          const child = spawn(process.execPath, [join(repo, "scripts/check-live.mjs"), `${origin}/`], { env: { ...process.env, APP_ORIGIN: origin, CHECK_LIVE_RETRY_MS: "0" } });
          let err = "";
          child.stderr.on("data", (d: Buffer) => (err += d.toString()));
          child.stdout.on("data", () => undefined);
          child.on("close", (code) => resolve({ code, err }));
        });
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    };

    await expect(run(catalog, "application/json")).resolves.toMatchObject({ code: 0 });
    const red = await run(shell, "text/html; charset=utf-8");
    expect(red.code).toBe(1);
    expect(red.err).toMatch(/models\/manifest\.json: 200 text\/html.*SPA shell/);
  }, 30_000);
});
