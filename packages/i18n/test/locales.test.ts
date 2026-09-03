import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { IntlMessageFormat } from "intl-messageformat";

const dir = join(__dirname, "../locales");
const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8")) as Record<string, string>;
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

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
        const ph = (s: string) => (s.match(/\{\s*([a-zA-Z0-9_]+)/g) ?? []).map((m) => m.replace(/\{\s*/, "")).sort();
        expect(ph(v), `${f}:${k}`).toEqual(ph(en[k] ?? ""));
      }
    }
  });
});
