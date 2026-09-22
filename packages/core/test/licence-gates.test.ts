import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURES, FEATURE_LIST, FREE_LEDGER_ROWS, PAYWALL_BULLETS, UNBUILT_FEATURES, VOICE_LINES, sellable } from "../src/licence";

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

/**
 * The §7 matrix has one machine-readable home, and a key in it is a promise. A key for a capability README declares cut
 * for 1.0 is deleted rather than left to rot: `apps/mobile/test/gates-wired.test.ts` proves the rest are called.
 */
describe("the gate table carries no declared cuts", () => {
  it("nothing on README's \"intentionally not built for 1.0\" list is still a gate key", () => {
    for (const cut of ["encryptedBackup", "deviceTransfer", "keyboardExtension", "lanConnection", "advancedControls", "gpuTuning", "speculativeDecoding", "multiModel", "compareModels", "localServer", "personaWidgets"]) expect(cut in FEATURES, cut).toBe(false);
  });

  it("every unbuilt key is a real key, and the built ones are not hidden in that list", () => {
    for (const f of UNBUILT_FEATURES) expect(FEATURE_LIST, f).toContain(f);
    for (const wired of ["documents", "ocr", "strictDocuments", "memory", "detailedStats", "officeIngest", "folders", "exportAll", "unlimitedPersonas", "proModels", "voiceConversation", "whisperDictation", "clientVaults", "auditLog", "signedExport", "templates", "redaction", "architectureStatement"]) expect(UNBUILT_FEATURES, wired).not.toContain(wired);
  });

  it("the §7.3 document rows and the §7.8 statistics row are Pro, and the Free receipt is the four rows §7.1 names", () => {
    expect(FEATURES.ocr).toBe("pro");
    expect(FEATURES.strictDocuments).toBe("pro");
    expect(FEATURES.detailedStats).toBe("pro");
    expect(FEATURES.officeIngest).toBe("work");
    expect(FREE_LEDGER_ROWS).toEqual(["model", "quant", "context", "msPerToken"]);
    for (const detail of ["tokPerSec", "ttft", "tokens", "time"]) expect(FREE_LEDGER_ROWS, detail).not.toContain(detail);
  });
});
