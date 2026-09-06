import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURES, PAYWALL_BULLETS, VOICE_LINES, sellable } from "../src/licence";

const en = JSON.parse(readFileSync(join(__dirname, "../../i18n/locales/en.json"), "utf8")) as Record<string, string>;

/** The paywall may only promise what this build ships (§2.3, §12.3): every line has a string, and Work is hidden while it has none. */
describe("paywall bullets", () => {
  it("every bullet has an en.json string for its tier", () => {
    for (const tier of ["pro", "work"] as const) for (const b of PAYWALL_BULLETS[tier]) expect(`paywall.${tier}.${b}` in en, `paywall.${tier}.${b}`).toBe(true);
  });
  it("voice lines are a subset of the offered bullets, so pulling them is one edit", () => {
    for (const v of VOICE_LINES) expect(PAYWALL_BULLETS.pro).toContain(v);
  });
  it("Pro and Work are both sellable: each has shipped capabilities behind its lines", () => {
    expect(sellable("pro")).toBe(true);
    expect(sellable("work")).toBe(true);
    expect(Object.values(FEATURES)).toContain("work");
  });
});
