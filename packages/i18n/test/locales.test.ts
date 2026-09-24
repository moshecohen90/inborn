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

describe("the paywall names only the stores that sell it (MosheAI item 8, 24.9.2026)", () => {
  /* The app promised Windows and macOS while the site's own Get section said they come after iOS and Android. */
  it("no locale sells Pro on a desktop store, and the Desktop button's string is gone with the button", () => {
    for (const f of files) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, string>;
      expect(d["paywall.noStore"], `${f} paywall.noStore`).not.toMatch(/windows|macos|màçÖS|Wïñdôws/i);
      expect("paywall.web.desktop" in d, `${f} paywall.web.desktop`).toBe(false);
    }
  });
});

describe("sizes in copy (QA F24)", () => {
  /* Every line of the model step that shows a size takes it from the catalog; a number typed into a locale goes stale in silence. */
  const SIZED = ["onboarding.model.source.bundled", "onboarding.model.source.ready", "onboarding.model.source.play", "onboarding.model.source.playPending", "onboarding.model.source.https", "onboarding.model.download"];
  it("every sized line of the onboarding step carries {size} and no locale spells a number", () => {
    for (const f of files) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, string>;
      for (const key of SIZED) {
        expect({ file: f, key, value: d[key] }, `${f}:${key}`).toEqual({ file: f, key, value: expect.stringMatching(/\{size\}/) });
        expect(d[key], `${f}:${key}`).not.toMatch(/\d/);
      }
    }
  });
});

describe("document paywall copy tells the user what to do (QA F85)", () => {
  /* Free keeps one attached file at a chat (§7.3 row 1, decided 22.9.2026): the toast that fires on a second file
     must say to remove the current one to add another, or get Pro for a library — not just restate the limit. */
  const cjk = new Set(["ja.json", "ko.json", "zh-Hant.json"]);
  it("quick.filePro names both the removal and the Pro library, in every real locale", () => {
    for (const f of files) {
      if (f === "pseudo.json") continue;
      const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, string>;
      const msg = d["quick.filePro"]!;
      expect(msg.length, `${f} quick.filePro`).toBeGreaterThanOrEqual(cjk.has(f) ? 25 : 60);
      expect(msg, `${f} quick.filePro`).toMatch(/pro/i);
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

/**
 * Round 48 (F212, F213). `proof.outIn` was the headline number of the trust screen and sat in English in
 * all seven translations; `de.json` carried the only em dash in the nine files; `en.json` the only curly quotes; and
 * `voice.onDevice` said PHONE on a tablet, a Mac and a browser while every neighbouring string used the select.
 */
describe("round 48 copy rules", () => {
  const real = files.filter((f) => f !== "pseudo.json");
  const load = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, string>;

  /* The readout of the one screen whose job is to be read: an English label here is an untranslated headline. */
  const READOUT = ["proof.outIn", "proof.connections", "proof.sinceInstall"];
  it("the Proof readout is translated in every locale, not left in English", () => {
    for (const f of real.filter((x) => x !== "en.json")) {
      const d = load(f);
      for (const k of READOUT) expect(d[k], `${f} ${k}`).not.toBe(en[k]);
    }
  });

  /* IBM Plex Sans has no U+2713: the fallback draws a symmetric V, so "sha256 \u2713" shipped as "sha256 \u221a".
     The Proof screen draws the mark with the app's own check icon, and every verified line ends on what was verified. */
  /**
   * `pseudo.json` is generated, but nothing bound it to its generator: `locales.test.ts` checked its keys and its ICU
   * placeholders and skipped its values, so a hand-typed entry survived every gate. Six had drifted by round 53, and
   * three of them were typed by hand in the wrong accents: `chats.more` had `Móré àçtîöns` where the map produces
   * `Môré àçtïôñs`, `chat.attach.title` `Åttåch döcüménts` for `Åttàçh dôçüméñts`, `onboarding.model.titleOne` a `Ý`
   * the map does not contain at all. The other three carried a stale `~` count, which is the part that actually does
   * the work: the padding is what makes a clipped label show up before a translator exists.
   */
  it("pseudo.json is exactly what its generator produces", async () => {
    const { build } = await import("../scripts/pseudo.mjs");
    expect(JSON.parse(readFileSync(join(dir, "pseudo.json"), "utf8"))).toEqual(build());
  });

  /* The complements: that the generator is not a no-op the comparison would pass anyway, and that importing it
     (which this guard does on every run) writes nothing, because the write is what `pnpm run pseudo` is for. */
  it("the generator lengthens and accents, so an identity function could not satisfy the guard", async () => {
    const { build, pseudo } = await import("../scripts/pseudo.mjs");
    expect(pseudo("Continue")).toBe("[Côñtïñüé~~~~]");
    /* The padding is the point: it is what makes a clipped label show up before a translator exists. */
    expect(pseudo("Continue").length).toBeGreaterThan("Continue".length * 1.4);
    /* Placeholders pass through untouched, or ICU would stop parsing. */
    expect(pseudo("Loading {model}…")).toContain("{model}");
    expect(Object.keys(build())).toEqual(Object.keys(en));
  });

  it("importing the generator writes nothing", async () => {
    const before = readFileSync(join(dir, "pseudo.json"), "utf8");
    await import("../scripts/pseudo.mjs");
    expect(readFileSync(join(dir, "pseudo.json"), "utf8")).toBe(before);
  });

  it("no locale spells a check mark the app font cannot draw", () => {
    for (const f of files) {
      const offenders = Object.entries(load(f)).filter(([, v]) => /[\u2713\u2714\u221a]/.test(v)).map(([k]) => k);
      expect(offenders, f).toEqual([]);
    }
  });

  it("no locale carries an em dash", () => {
    for (const f of files) {
      const offenders = Object.entries(load(f)).filter(([, v]) => v.includes("—")).map(([k]) => k);
      expect(offenders, f).toEqual([]);
    }
  });

  /* German „…" and French « … » are that language's typography and stay; the English file quotes settings plainly. */
  it("en.json uses straight quotes", () => {
    const offenders = Object.entries(en).filter(([, v]) => /[“”]/.test(v)).map(([k]) => k);
    expect(offenders).toEqual([]);
  });

  it("every string that names the device you are holding takes it from {device}", () => {
    for (const f of real) {
      const d = load(f);
      for (const k of ["voice.onDevice", "models.recommendedNone", "models.recommendedFor"]) {
        expect(d[k], `${f} ${k}`).toContain("{device");
      }
    }
  });
});
