import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { IntlMessageFormat } from "intl-messageformat";

const dir = join(__dirname, "../locales");
const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8")) as Record<string, string>;
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

/* Argument names from the parsed ICU tree; a regex would also catch the first word of every plural branch. */
function placeholders(message: string): string[] {
  const names = new Set<string>();
  const walk = (nodes: unknown[]): void => {
    for (const node of nodes) {
      const n = node as { type: number; value?: unknown; options?: Record<string, { value: unknown[] }>; children?: unknown[] };
      if (n.type !== 0 && n.type !== 7 && typeof n.value === "string") names.add(n.value);
      if (n.options) for (const o of Object.values(n.options)) walk(o.value);
      if (n.children) walk(n.children);
    }
  };
  walk(new IntlMessageFormat(message, "en").getAst());
  return [...names].sort();
}

describe("locales", () => {
  it("every locale has every key of en.json and no extras", () => {
    for (const f of files) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, string>;
      const missing = Object.keys(en).filter((k) => !(k in d));
      const extra = Object.keys(d).filter((k) => !(k in en));
      expect({ file: f, missing, extra }).toEqual({ file: f, missing: [], extra: [] });
    }
  });
  it("every message is valid ICU and keeps the same placeholders as en", () => {
    for (const f of files) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, string>;
      for (const [k, v] of Object.entries(d)) {
        expect(() => new IntlMessageFormat(v, "en"), `${f}:${k}`).not.toThrow();
        expect(placeholders(v), `${f}:${k}`).toEqual(placeholders(en[k] ?? ""));
      }
    }
  });
});

describe("sizes in copy (QA F24)", () => {
  it("the onboarding offer takes its size from the catalog, so no locale spells a number", () => {
    for (const f of files) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, string>;
      expect({ file: f, fast: d["onboarding.model.fast"] }, `${f}:onboarding.model.fast`).toEqual({ file: f, fast: expect.stringMatching(/\{size\}/) });
      expect(d["onboarding.model.fast"], `${f}:onboarding.model.fast`).not.toMatch(/\d/);
    }
  });
});

describe("ledger labels in CJK locales (QA F32)", () => {
  /* MS and TOK / S stay Latin units in ja and ko; only the word "token" is translated, and zh-Hant had kept all three English. */
  const tokenLabels = ["ledger.msPerToken", "ledger.ttft", "ledger.tokens"] as const;
  it("translates the word token rather than leaving the English label", () => {
    for (const f of ["ja.json", "ko.json", "zh-Hant.json"]) {
      const l = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, string>;
      for (const k of tokenLabels) {
        expect(l[k], `${f} ${k}`).not.toBe(en[k]);
        expect(l[k], `${f} ${k}`).toMatch(/[぀-ヿ一-鿿가-힯]/);
      }
    }
  });
});
