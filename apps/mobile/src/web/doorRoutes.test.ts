import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODEL_FREE_ROUTES, READ_BEFORE_ONBOARDING, needsModel, webRoute } from "./doorRoutes";

/**
 * F293. The browser download door replaced every route, so a first-time visitor who had not taken 1.3 GB could not
 * reach the price list at all — the one screen that exists to be read before anyone downloads anything.
 */
describe("F293 · the download door only stands in front of routes that need a model", () => {
  it("lets through every route that answers without a model", () => {
    for (const route of MODEL_FREE_ROUTES) expect(needsModel(route), route).toBe(false);
  });

  it("lets through the reason query and the sub-routes of those screens", () => {
    for (const route of ["/paywall?reason=strictDocuments", "/legal/privacy", "/settings/about", "/proof/airplane", "/settings/language?answer=1", "/vault/"]) {
      expect(needsModel(route), route).toBe(false);
    }
  });

  it("still gates the chat, which is the screen the model answers in", () => {
    for (const route of ["/", "/chats", "/documents", "/voice", "/work/audit", "/onboarding"]) expect(needsModel(route), route).toBe(true);
  });

  it("does not let a look-alike path through", () => {
    for (const route of ["/paywalls", "/settings-export", "/proofs", "/legalese"]) expect(needsModel(route), route).toBe(true);
  });

  it("the shell asks the question instead of replacing every route", () => {
    const shell = readFileSync(join(__dirname, "WebShell.tsx"), "utf8");
    expect(shell).toContain("const route = webRoute(usePathname(), { ready, onboarded: prefs.onboarded, hasSource: !!boot.source });");
    expect(shell).toContain('{route.kind === "children" ? (');
  });
});

/**
 * Round 103 (Moshe, 26.9): a fresh browser opened on the download door. "I want the whole app experience from the
 * start": the first visit is onboarding, and the download is its Model step.
 */
describe("round 103 · the web starts with onboarding", () => {
  const first = { ready: false, onboarded: false, hasSource: true };
  it("a first visit opens on Welcome, not on a download", () => {
    expect(webRoute("/", first)).toEqual({ kind: "children" });
    expect(webRoute("/onboarding", first)).toEqual({ kind: "children" });
    expect(webRoute("/onboarding/model", first)).toEqual({ kind: "children" });
  });

  it("Sealed and Lock wait for a model", () => {
    for (const p of ["/onboarding/sealed", "/onboarding/lock"]) {
      expect(webRoute(p, first)).toEqual({ kind: "redirect", to: "/onboarding/model" });
      expect(webRoute(p, { ...first, ready: true })).toEqual({ kind: "children" });
    }
  });

  it("deep links wait for onboarding, with or without a model", () => {
    for (const p of ["/settings", "/documents", "/chats", "/vault", "/voice", "/work/audit", "/lock", "/settings/about"]) {
      expect(webRoute(p, first), p).toEqual({ kind: "redirect", to: "/onboarding" });
      expect(webRoute(p, { ...first, ready: true }), p).toEqual({ kind: "redirect", to: "/onboarding" });
    }
  });

  it("the price list, the legal texts and the proof stay readable before onboarding (F293)", () => {
    for (const p of READ_BEFORE_ONBOARDING) expect(webRoute(p, first), p).toEqual({ kind: "children" });
    expect(webRoute("/paywall?reason=strictDocuments", first)).toEqual({ kind: "children" });
    expect(webRoute("/legal/privacy", first)).toEqual({ kind: "children" });
    expect(webRoute("/proof/airplane", first)).toEqual({ kind: "children" });
  });

  it("a returning visit with a model goes straight to the chat", () => {
    const back = { ready: true, onboarded: true, hasSource: true };
    for (const p of ["/", "/documents", "/settings", "/onboarding"]) expect(webRoute(p, back), p).toEqual({ kind: "children" });
  });

  it("onboarded with the model gone: the Model step alone, not the whole onboarding", () => {
    const gone = { ready: false, onboarded: true, hasSource: true };
    for (const p of ["/", "/documents", "/chats", "/onboarding"]) expect(webRoute(p, gone), p).toEqual({ kind: "model-step" });
    for (const p of MODEL_FREE_ROUTES) expect(webRoute(p, gone), p).toEqual({ kind: "children" });
  });

  it("no catalog: the catalog door, before and after onboarding", () => {
    expect(webRoute("/onboarding", { ready: false, onboarded: false, hasSource: false })).toEqual({ kind: "catalog" });
    expect(webRoute("/", { ready: false, onboarded: true, hasSource: false })).toEqual({ kind: "catalog" });
  });
});
