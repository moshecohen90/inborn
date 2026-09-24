import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODEL_FREE_ROUTES, needsModel } from "./doorRoutes";

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
    expect(shell).toContain("const gated = needsModel(usePathname());");
    expect(shell).toContain("{ready || !gated ? children :");
  });
});
