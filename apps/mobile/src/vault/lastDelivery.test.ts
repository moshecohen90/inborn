import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newestDelivery, type DeliveryCandidate } from "./lastDelivery";
import { doneDelivery } from "../proof/deliveryLine";

/**
 * F206: the Proof screen's LAST DELIVERY branch waits for `status: "done"`, which nothing ever set — the strip went
 * from "verifying" straight back to null, so the section fell back to the built-in text after a real download.
 */
const c = (over: Partial<DeliveryCandidate>): DeliveryCandidate => ({ id: "fast", name: "Fast", bytes: 100, via: "https", at: 10, ready: true, ...over });

describe("newestDelivery", () => {
  it("names the newest install", () => {
    expect(newestDelivery([c({ id: "instant", name: "Instant", at: 5, via: "bundled" }), c({ id: "fast", at: 9 })])).toMatchObject({ id: "fast", at: 9 });
    expect(newestDelivery([c({ id: "fast", at: 9 }), c({ id: "instant", name: "Instant", at: 5, via: "bundled" })])).toMatchObject({ id: "fast", at: 9 });
  });

  it("keeps the source the bytes actually came from", () => {
    expect(newestDelivery([c({ via: "play" })])?.via).toBe("play");
    expect(newestDelivery([c({ id: "mine", name: "Mine", via: "import" })])?.via).toBe("import");
  });

  it("is nothing at all when the vault is empty", () => {
    expect(newestDelivery([])).toBeNull();
  });

  it("refuses a record whose file this phone cannot load", () => {
    expect(newestDelivery([c({ ready: false })])).toBeNull();
    expect(newestDelivery([c({ ready: false, at: 99 }), c({ id: "instant", name: "Instant", at: 5 })])).toMatchObject({ id: "instant" });
  });

  it("refuses a record with no name and one with no install time", () => {
    expect(newestDelivery([c({ name: "" })])).toBeNull();
    expect(newestDelivery([c({ at: 0 })])).toBeNull();
  });
});

describe("doneDelivery · what the strip publishes once nothing is downloading", () => {
  it("is a done state the Proof screen's branch accepts", () => {
    expect(doneDelivery({ name: "Fast", bytes: 1234, via: "https" })).toEqual({ name: "FAST", status: "done", progress: 1, totalBytes: 1234, source: "https" });
  });

  it("stays null when the vault has delivered nothing", () => {
    expect(doneDelivery(null)).toBeNull();
  });
});

describe("the strip is wired to it · the branch Proof waits for is reachable", () => {
  const src = readFileSync(join(__dirname, "../services/AppServices.tsx"), "utf8");
  const proof = readFileSync(join(__dirname, "../screens/Proof/Proof.tsx"), "utf8");

  it("publishes the done state when no download is live", () => {
    expect(src, "the vault subscription must fall back to the last install, not to null").toContain("? doneDelivery(vault.lastDelivery())");
  });

  it("still publishes nothing but progress while a download runs", () => {
    expect(src).toMatch(/status: "delivering"/);
    expect(src).toMatch(/status: "verifying"/);
  });

  it("matches the status the Proof screen branches on", () => {
    expect(proof).toContain('delivery.status === "done"');
  });
});
