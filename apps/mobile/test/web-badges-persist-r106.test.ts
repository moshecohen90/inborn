import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP = join(__dirname, "..");
const REPO = join(APP, "../..");
const read = (rel: string) => readFileSync(join(APP, "src", rel), "utf8");
const LOCALES = ["en", "ja", "de", "fr", "es", "pt-BR", "ko", "zh-Hant"] as const;
const locale = (code: string) => JSON.parse(readFileSync(join(REPO, "packages/i18n/locales", `${code}.json`), "utf8")) as Record<string, string>;

/**
 * F410 (Moshe, 27.9): the store buttons are the stores' own badges, so a reader recognises them at a glance, as on
 * l.hebrewbible.app. The artwork is Apple's and Google's, unmodified, one per launch language.
 */
describe("F410 · the official App Store and Google Play badges, per language", () => {
  const dir = join(APP, "public/badges");
  it("ships the black Apple badge and the Google Play badge in all eight languages, as plain vector artwork", () => {
    const files = existsSync(dir) ? readdirSync(dir).sort() : [];
    const want = LOCALES.flatMap((l) => [`app-store-${l}.svg`, `google-play-${l}.svg`]).sort();
    expect(files).toEqual(want);
    for (const f of files) {
      const svg = readFileSync(join(dir, f), "utf8");
      expect(svg, f).toMatch(/^<svg[^>]*viewBox="[\d. ]+"/);
      /* No fonts to fall back, no remote pieces, nothing that runs. */
      expect(svg, f).not.toMatch(/<text|<image|<script|<foreignObject|href="http|@import|sodipodi|inkscape/);
    }
  });

  it("one component draws them, and every place that sent a reader to a store uses it", () => {
    const badges = read("web/StoreBadges.tsx");
    expect(badges).toContain("/badges/");
    expect(badges).toContain('accessibilityRole="link"');
    expect(badges).toContain("accessibilityLabel={t(`web.badge.${where}`)}");
    expect(badges).toContain("STORE_LINKS[where]");
    for (const file of ["web/WebShell.tsx", "screens/paywall/WebStoreBlock.tsx", "screens/vault/VaultEntry.web.tsx"]) expect(read(file), file).toContain("<StoreBadges");
    /* The text buttons are gone: a store is named by its badge, not by a label in our font. */
    expect(read("screens/paywall/WebStoreBlock.tsx")).not.toContain("t(`paywall.web.${where}`)");
    expect(read("web/WebShell.tsx")).not.toMatch(/testID="get-app" accessibilityRole="link"/);
  });

  it("Apple's floor is 40 px on screen and a quarter of the height clear around it; the finger still gets 44", () => {
    const badges = read("web/StoreBadges.tsx");
    expect(badges).toMatch(/BADGE_HEIGHT = 40\b/);
    expect(badges).toContain("BADGE_HEIGHT / 4");
    expect(badges).toContain("minHeight: MIN_TOUCH");
  });

  it("each badge is announced by what it says, in every language", () => {
    for (const l of LOCALES) for (const k of ["web.badge.appStore", "web.badge.play"]) expect(locale(l)[k], `${l} ${k}`).toBeTruthy();
    expect(locale("en")["web.badge.appStore"]).toBe("Download on the App Store");
    expect(locale("en")["web.badge.play"]).toBe("Get it on Google Play");
  });

  it("the site's download row is the same badges, in the page's language", async () => {
    const out = mkdtempSync(join(tmpdir(), "inborn-site-badges-"));
    try {
      const site = (await import(/* @vite-ignore */ join(REPO, "apps/site/build.mjs"))) as { build: (o: { out: string }) => unknown };
      site.build({ out });
      for (const [dir, code] of [["", "en"], ["ja/", "ja"], ["pt-br/", "pt-BR"], ["zh-hant/", "zh-Hant"]] as const) {
        const html = readFileSync(join(out, `${dir}download.html`), "utf8");
        expect(html, dir).toMatch(new RegExp(`<img class="store-badge" src="/badges/app-store-${code}\\.svg" width="\\d+" height="40" alt="${locale(code)["web.badge.appStore"]}">`));
        expect(html, dir).toMatch(new RegExp(`<img class="store-badge" src="/badges/google-play-${code}\\.svg" width="135" height="40" alt="${locale(code)["web.badge.play"]}">`));
        expect(existsSync(join(out, `badges/app-store-${code}.svg`)), code).toBe(true);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("F411 · the model is kept, and Settings says so", () => {
  it("asks the browser to keep the storage after the first download completes, before the page reloads", () => {
    const offer = read("web/ModelOffer.tsx");
    const done = offer.slice(offer.indexOf('if (end.type === "done")'));
    expect(done.indexOf('await protectStorage("download")')).toBeGreaterThan(-1);
    expect(done.indexOf('await protectStorage("download")')).toBeLessThan(done.indexOf("onReady()"));
  });

  it("asks again once onboarding is done", () => {
    expect(read("web/WebShell.tsx")).toContain('protectStorage("onboarded")');
  });

  it("Privacy & storage shows whether the browser keeps it, and Safari's install hint where it applies", () => {
    const storage = read("screens/Settings/Storage.tsx");
    expect(storage).toContain("<DurableStorage");
    const durable = read("web/DurableStorage.tsx");
    expect(durable).toContain('testID="storage-durable"');
    expect(durable).toContain('"storage.durable.protected"');
    expect(durable).toContain('"storage.durable.notProtected"');
    expect(durable).toContain("<InstallHint");
    expect(read("web/ModelOffer.tsx")).toContain("<InstallHint");
    for (const l of LOCALES)
      for (const k of ["storage.durable.label", "storage.durable.protected", "storage.durable.notProtected", "storage.durable.unknown", "web.durable.hintMac", "web.durable.hintIos"])
        expect(locale(l)[k], `${l} ${k}`).toBeTruthy();
    expect(locale("en")["storage.durable.protected"]).toBe("Storage is protected from automatic cleanup");
    expect(locale("en")["storage.durable.notProtected"]).toBe("The browser may clear it when space runs low");
  });
});
