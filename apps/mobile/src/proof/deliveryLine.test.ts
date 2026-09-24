import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DeliverySource } from "@inborn/core";
import { deliveryHashChecked, deliveryKey } from "./deliveryLine";

const en = JSON.parse(readFileSync(join(__dirname, "../../../../packages/i18n/locales/en.json"), "utf8")) as Record<string, string>;
const SOURCES: DeliverySource[] = ["bundled", "play", "apple", "https", "hf", "import"];

describe("F206 · the Proof screen's last-delivery line", () => {
  it("names the source the bytes came from, so a CDN download is never called an Apple asset pack", () => {
    expect(deliveryKey("https")).toBe("proof.delivery.https");
    expect(deliveryKey("hf")).toBe("proof.delivery.hf");
    expect(deliveryKey("import")).toBe("proof.delivery.imported");
    expect(deliveryKey("play")).toBe("proof.delivery.play");
    expect(deliveryKey("bundled")).toBe("proof.delivery.builtin");
  });

  /* The complement: `apple` is the only source that may print the Apple line, and nothing else may reach it. */
  it("keeps the Apple line for an Apple-hosted pack alone", () => {
    expect(deliveryKey("apple")).toBe("proof.delivery.apple");
    expect(SOURCES.filter((s) => deliveryKey(s) === "proof.delivery.apple")).toEqual(["apple"]);
  });

  it("every source resolves to a key en.json actually has", () => {
    for (const s of SOURCES) expect(deliveryKey(s) in en, `${s} -> ${deliveryKey(s)}`).toBe(true);
  });

  it("the HTTPS line names the host it downloaded from, and the others do not invent one", () => {
    expect(en[deliveryKey("https")]).toContain("{host}");
    for (const s of SOURCES.filter((x) => x !== "https")) expect(en[deliveryKey(s)], s).not.toContain("{host}");
  });

  /* F254: the drawn check may only follow a line whose last clause is the hash, never one that ends on a caveat. */
  it("marks the hash-verified sources and nothing else", () => {
    expect(SOURCES.filter(deliveryHashChecked).sort()).toEqual(["apple", "hf", "https", "play"]);
    for (const s of SOURCES) {
      if (deliveryHashChecked(s)) expect(en[deliveryKey(s)], s).toMatch(/sha256$/);
      else expect(en[deliveryKey(s)], s).not.toMatch(/sha256$/);
    }
  });
});
