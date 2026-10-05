import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { USE_CASES } from "@inborn/core";
import { toggleUse, usesLabel } from "../src/screens/vault/bestFor";

const dir = join(__dirname, "../../../packages/i18n/locales");
const locale = (f: string): Record<string, string> => JSON.parse(readFileSync(join(dir, f), "utf8"));
const en = locale("en.json");
const t = (key: string, params: Record<string, unknown> = {}) => en[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k]));
const KEYS = ["vault.bestFor.two", "vault.bestFor.more", "vault.bestFor.several", "vault.bestFor.notAll", "vault.bestFor.noneAll"];

/* Moshe 5.10: "Best for" takes several uses at once. */
describe("vault Best for picker (round 131)", () => {
  it("a tap adds a use in catalog order, a second tap removes it", () => {
    expect(toggleUse(["chat"], "documents")).toEqual(["chat", "documents"]);
    expect(toggleUse(["documents"], "chat")).toEqual(["chat", "documents"]);
    expect(toggleUse(["chat", "documents"], "chat")).toEqual(["documents"]);
  });

  it("the last use stays selected", () => {
    expect(toggleUse(["chat"], "chat")).toEqual(["chat"]);
    let uses = [...USE_CASES];
    for (const u of USE_CASES) uses = toggleUse(uses, u);
    expect(uses).toEqual(["math"]);
  });

  it("the chip names one or two uses and counts past that", () => {
    expect(usesLabel(t, ["chat"])).toBe("Chat");
    expect(usesLabel(t, ["chat", "documents"])).toBe("Chat + Documents");
    expect(usesLabel(t, ["chat", "documents", "code"])).toBe("Chat +2");
    expect(usesLabel(t, USE_CASES)).toBe("Chat +7");
  });

  it("every locale carries the new strings with the same placeholders", () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const l = locale(f);
      for (const k of KEYS) {
        expect(l[k], `${f} ${k}`).toBeTruthy();
        expect(holes(l[k]!), `${f} ${k}`).toBe(holes(en[k]!));
      }
    }
  });
});
