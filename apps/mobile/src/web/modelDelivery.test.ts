import { beforeEach, describe, expect, it } from "vitest";
import { fetchManifest, parseManifest, type WebModelSource } from "./modelDelivery";
import { webReady, type WebBoot } from "./boot";

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

/**
 * F271 (B1, 24.9.2026). The origin answered /models/manifest.json with its own index.html: 200, text/html. The old
 * reader called JSON.parse on it, swallowed the throw and returned an empty list, which every screen read as
 * "no model fits this browser". An outage and a broken deploy must not look like a browser that is simply too small.
 */
describe("fetchManifest tells a broken catalog from an empty one", () => {
  const CATALOG = JSON.stringify({ models: [m("instant", "instant", 100)] });
  const store = new Map<string, string>();
  const g = globalThis as unknown as { fetch: unknown; localStorage: unknown; location: unknown };

  beforeEach(() => {
    store.clear();
    g.location = { origin: ORIGIN };
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });

  const answer = (body: string, { type = "application/json", status = 200 } = {}) => {
    g.fetch = async () => ({ ok: status >= 200 && status < 300, status, headers: { get: () => type }, text: async () => body });
  };

  it("reads a JSON catalog and remembers it", async () => {
    answer(CATALOG);
    await expect(fetchManifest()).resolves.toEqual({ models: [expect.objectContaining({ id: "instant" })], error: null });
    expect(store.get("inborn.web.manifest")).toBe(CATALOG);
  });

  it("calls the SPA shell what it is instead of an empty catalog", async () => {
    answer('<!DOCTYPE html>\n<html lang="en"><head></head></html>', { type: "text/html" });
    await expect(fetchManifest()).resolves.toEqual({ models: [], error: "not-json" });
    expect(store.size, "a 200 of the wrong thing must not become this browser's remembered catalog").toBe(0);
  });

  it("says unreachable when the fetch fails or the origin answers an error", async () => {
    g.fetch = async () => {
      throw new TypeError("network");
    };
    await expect(fetchManifest()).resolves.toEqual({ models: [], error: "unreachable" });
    answer(CATALOG, { status: 503 });
    await expect(fetchManifest()).resolves.toEqual({ models: [], error: "unreachable" });
  });

  it("falls back to the remembered catalog, and then reports no error at all", async () => {
    answer(CATALOG);
    await fetchManifest();
    g.fetch = async () => {
      throw new TypeError("offline");
    };
    await expect(fetchManifest()).resolves.toEqual({ models: [expect.objectContaining({ id: "instant" })], error: null });
  });

  it("a real catalog that lists nothing for this browser is not an error", async () => {
    answer(JSON.stringify({ models: [] }));
    await expect(fetchManifest()).resolves.toEqual({ models: [], error: null });
  });
});

describe("F271 · a browser with no catalog is not a browser that is ready", () => {
  const boot = (over: Partial<WebBoot>): WebBoot => ({ gate: { maxTier: "fast" } as WebBoot["gate"], engine: "wllama", chromePromptApi: false, opfs: true, choices: [], source: null, catalogError: null, status: { kind: "missing" }, ...over });

  it("holds the door when the catalog failed, and opens it when the catalog is merely empty", () => {
    expect(webReady(boot({ catalogError: "not-json" }))).toBe(false);
    expect(webReady(boot({ catalogError: "unreachable" }))).toBe(false);
    expect(webReady(boot({}))).toBe(true);
  });

  it("still opens for a model on disk or Chrome's own engine", () => {
    const source = { id: "instant" } as WebModelSource;
    expect(webReady(boot({ catalogError: "not-json", source, status: { kind: "ready", meta: {} as never } }))).toBe(true);
    expect(webReady(boot({ catalogError: "not-json", engine: "chrome-nano" }))).toBe(true);
  });
});
