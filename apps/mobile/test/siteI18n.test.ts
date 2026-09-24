import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LAUNCH_LOCALES, RTL_LOCALES } from "@inborn/i18n";

/**
 * Round 67 (F314–F318). Moshe, 24.9: "the site defaults to English but the same site exists in all the other
 * languages, with a language switcher and a matching sitemap". The site is static, so every one of those claims is a
 * file that either exists or does not: these read the built output rather than the generator's intentions.
 */

const repo = join(__dirname, "../../..");
/* Its own output directory: legal-texts.test.ts builds the site too, and a shared dist is a race between workers. */
const dist = mkdtempSync(join(tmpdir(), "inborn-site-i18n-"));
const read = (p: string) => readFileSync(join(repo, p), "utf8");
const readDist = (p: string) => readFileSync(join(dist, p), "utf8");

type Locale = { code: string; dir: string; name: string; og: string };
let site: {
  build: (options?: { out?: string }) => string[];
  LOCALES: Locale[];
  EN: Locale;
  RTL_LOCALES: Set<string>;
  htmlDir: (code: string) => string;
  localizeLinks: (l: Locale, html: string) => string;
  siteOrigin: string;
  appOrigin: string;
  strings: Record<string, Record<string, string>>;
};
let built: string[] = [];

beforeAll(async () => {
  site = (await import(/* @vite-ignore */ join(repo, "apps/site/build.mjs"))) as typeof site;
  built = site.build({ out: dist });
}, 120_000);

afterAll(() => rmSync(dist, { recursive: true, force: true }));

const pageOf = (l: Locale, p: string) => readDist(`${l.dir ? `${l.dir}/` : ""}${p.replace(/^\//, "")}`);
const urlOf = (l: Locale, p: string) => `${site.siteOrigin}${l.dir ? `/${l.dir}` : ""}${p === "/index.html" ? "/" : p.replace(/\.html$/, "")}`;
/** The pages the English root serves; every other language owes exactly the same set. */
const PAGES = ["/index.html", "/download.html", "/proof.html", "/compare.html", "/support.html", "/blog.html", "/blog/why-on-device.html", "/blog/how-the-proof-works.html", "/blog/choosing-a-model.html", "/privacy.html", "/terms.html", "/licenses.html", "/accessibility.html", "/404.html"];

describe("F314 · the same site in eight languages", () => {
  it("builds the launch locales packages/i18n declares, English first and at the root", () => {
    expect(site.LOCALES.map((l) => l.code)).toEqual([...LAUNCH_LOCALES]);
    expect(site.EN.code).toBe("en");
    expect(site.EN.dir).toBe("");
    /* A static host serves /pt-BR/ and /pt-br/ as two different pages, so the URL segment is lowercase. */
    for (const l of site.LOCALES.slice(1)) expect(l.dir).toBe(l.code.toLowerCase());
  });

  it("serves every page in every language", () => {
    for (const l of site.LOCALES) {
      for (const p of PAGES) expect(existsSync(join(dist, l.dir, p)), `${l.code}${p}`).toBe(true);
    }
    expect(built.length).toBe(PAGES.length * site.LOCALES.length);
  });

  it("holds a complete string file per language, with the same keys and the same tokens", () => {
    const en = site.strings.en!;
    expect(Object.keys(en).length).toBeGreaterThan(300);
    const marks = (s: string) => [...s.matchAll(/\{\{[A-Za-z_:.-]+\}\}/g)].map((m) => m[0]).sort().join("|");
    for (const l of site.LOCALES.slice(1)) {
      const got = site.strings[l.code]!;
      expect(Object.keys(got).sort(), l.code).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en)) expect(marks(got[key]!), `${l.code} ${key}`).toBe(marks(en[key]!));
    }
  });

  /* The complement: identical key sets would also pass on eight copies of the English file. */
  it("does not ship English prose as a translation", () => {
    const en = site.strings.en!;
    const sentences = Object.keys(en).filter((k) => en[k]!.length > 45 && /\s/.test(en[k]!));
    expect(sentences.length).toBeGreaterThan(100);
    for (const l of site.LOCALES.slice(1)) {
      const same = sentences.filter((k) => site.strings[l.code]![k] === en[k]);
      expect(same, `${l.code} left ${same.length} English sentences`).toEqual([]);
    }
  });

  it("marks each page with its own language, and would mark an RTL language as RTL", () => {
    for (const l of site.LOCALES) {
      expect(pageOf(l, "/index.html")).toContain(`<html lang="${l.code}" dir="ltr">`);
    }
    expect([...site.RTL_LOCALES]).toEqual([...RTL_LOCALES]);
    for (const code of ["he", "ar", "he-IL"]) expect(site.htmlDir(code)).toBe("rtl");
    for (const code of ["en", "de", "pt-BR", "zh-Hant"]) expect(site.htmlDir(code)).toBe("ltr");
  });

  /* A reader who follows a link inside a German sentence must stay on the German site (three translators hit this). */
  it("keeps a link written inside the copy in its own language", () => {
    const de = site.LOCALES.find((l) => l.code === "de")!;
    expect(site.localizeLinks(de, '<a href="/proof">x</a>')).toBe('<a href="/de/proof">x</a>');
    expect(site.localizeLinks(de, '<a href="/terms#2-free">x</a>')).toBe('<a href="/de/terms#2-free">x</a>');
    expect(site.localizeLinks(de, '<a href="/">x</a>')).toBe('<a href="/de/">x</a>');
    /* Already localized, an asset, an anchor and an absolute URL are all left alone. */
    expect(site.localizeLinks(de, '<a href="/de/proof">x</a>')).toBe('<a href="/de/proof">x</a>');
    expect(site.localizeLinks(de, '<link href="/site.css">')).toBe('<link href="/site.css">');
    expect(site.localizeLinks(de, '<a href="#get">x</a>')).toBe('<a href="#get">x</a>');
    expect(site.localizeLinks(de, '<a href="https://inbornapp.com/proof">x</a>')).toBe('<a href="https://inbornapp.com/proof">x</a>');
    expect(site.localizeLinks(site.EN, '<a href="/proof">x</a>')).toBe('<a href="/proof">x</a>');
    for (const l of site.LOCALES.slice(1)) {
      /* The two switchers link out of the language on purpose; everything else on the page must not. */
      const html = pageOf(l, "/proof.html")
        .replace(/<link rel="alternate"[^>]*>/g, "")
        .replace(/<details class="lang">[\s\S]*?<\/details>/g, "")
        .replace(/<nav class="lang-list"[\s\S]*?<\/nav>/g, "");
      const foreign = [...html.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]!).filter((h) => !h.startsWith(`/${l.dir}/`) && !/^\/(site\.css|favicon\.svg|apple-touch-icon\.png|icon-512\.png|og\/|fonts\/)/.test(h));
      expect(foreign, `${l.code}/proof links out of its language`).toEqual([]);
    }
  });
});

describe("F315 · a language switcher, hreflang, sitemaps and llms.txt", () => {
  it("offers every language from every page, as plain links and with no script", () => {
    for (const l of site.LOCALES) {
      const html = pageOf(l, "/download.html");
      for (const other of site.LOCALES) {
        expect(html, `${l.code} does not offer ${other.code}`).toContain(`<a href="${other.dir ? `/${other.dir}` : ""}/download" hreflang="${other.code}" lang="${other.code}"`);
      }
      expect(html).toContain('aria-current="true"');
      expect(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "")).not.toMatch(/<script/);
    }
  });

  it("names every language as an alternate of every page, with x-default on English", () => {
    for (const l of site.LOCALES) {
      for (const p of PAGES) {
        const html = pageOf(l, p);
        for (const other of site.LOCALES) expect(html, `${l.code}${p} → ${other.code}`).toContain(`<link rel="alternate" hreflang="${other.code}" href="${urlOf(other, p)}">`);
        expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${urlOf(site.EN, p)}">`);
        expect(html).toContain(`<link rel="canonical" href="${urlOf(l, p)}">`);
        expect(html).toContain(`<meta property="og:locale" content="${l.og}">`);
      }
    }
  });

  it("publishes one sitemap per language under one index, listing exactly the pages it built", () => {
    const index = readDist("sitemap.xml");
    expect(index).toContain("<sitemapindex");
    for (const l of site.LOCALES) {
      expect(index).toContain(`<loc>${site.siteOrigin}/sitemap-${l.code}.xml</loc>`);
      const map = readDist(`sitemap-${l.code}.xml`);
      const urls = [...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!).sort();
      /* 404 is the one page a sitemap must not offer: it is reached, never indexed. */
      expect(urls).toEqual(PAGES.filter((p) => p !== "/404.html").map((p) => urlOf(l, p)).sort());
    }
    expect(readDist("robots.txt")).toContain(`Sitemap: ${site.siteOrigin}/sitemap.xml`);
  });

  it("writes llms.txt per language, each naming its own URLs and all eight sites", () => {
    for (const l of site.LOCALES) {
      const llms = readDist(`${l.dir ? `${l.dir}/` : ""}llms.txt`);
      expect(llms).toContain(`](${urlOf(l, "/proof.html")}):`);
      for (const other of site.LOCALES) expect(llms, `${l.code}/llms.txt omits ${other.code}`).toContain(urlOf(other, "/index.html"));
      expect(existsSync(join(dist, l.dir, "llms-full.txt"))).toBe(true);
    }
  });

  it("declares the page's own language in its structured data", () => {
    for (const l of site.LOCALES) {
      const graph = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(pageOf(l, "/index.html"))![1]!.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&"));
      const langs = graph["@graph"].filter((n: { inLanguage?: string }) => n.inLanguage).map((n: { inLanguage: string }) => n.inLanguage);
      expect(langs.length).toBeGreaterThan(1);
      for (const code of langs) expect(code).toBe(l.code);
    }
  });
});

describe("F317 · the composer still works in every language", () => {
  it("posts the first message to the web app with ?q=, from every language", () => {
    for (const l of site.LOCALES) {
      const html = pageOf(l, "/index.html");
      expect(html).toContain(`<form class="composer" action="${site.appOrigin}/" method="get" role="search">`);
      expect(html).toContain('<input id="q" name="q"');
    }
  });

  /* The app reads the browser's own locale (AppServices boot), so the site passes no language: a `?lang=` the app
     ignores would be a promise the address bar makes and the app breaks. */
  it("passes no language the app does not read", () => {
    expect(read("apps/mobile/src/share/useShareTarget.ts")).not.toMatch(/\blang\b/);
    for (const l of site.LOCALES) expect(pageOf(l, "/index.html")).not.toMatch(/name="lang"|[?&]lang=/);
  });
});

describe("F316 · the stylesheet is direction-agnostic", () => {
  /* No RTL language launches, so nothing would catch a physical margin until Hebrew shipped and the page mirrored wrong. */
  it("lays out with logical properties, not left and right", () => {
    const css = read("apps/site/src/site.css");
    const layout = css.split("\n").filter((line) => /(margin|padding|border|inset)-(left|right)\s*:|(^|\s)(left|right)\s*:/.test(line) && !/border-right: 1\.5px|border-bottom: 1\.5px/.test(line));
    expect(layout, `physical side properties: ${layout.join(" · ")}`).toEqual([]);
    expect(css).not.toMatch(/text-align:\s*(left|right)/);
  });
});

describe("the page set is the one the app links to", () => {
  it("every legal page the app opens exists in every language", () => {
    for (const l of site.LOCALES) {
      for (const p of ["/privacy.html", "/terms.html", "/licenses.html", "/accessibility.html"]) {
        expect(existsSync(join(dist, l.dir, p)), `${l.code}${p}`).toBe(true);
      }
    }
    /* The app links to the English URLs (legalLinks.ts), which stay at the root. */
    expect(read("apps/mobile/src/lib/legalLinks.ts")).toContain('"/privacy"');
  });

  it("publishes the legal texts in English only, and says so on every translated page", () => {
    for (const l of site.LOCALES.slice(1)) {
      const html = pageOf(l, "/privacy.html");
      expect(html, `${l.code}/privacy`).toContain('<article class="prose legal" lang="en" dir="ltr">');
      expect(html).toContain(site.strings[l.code]!["ui.legal.english-only"]!.slice(0, 40));
    }
    expect(pageOf(site.EN, "/privacy.html")).toContain('<article class="prose legal">');
  });
});

describe("the sources the build reads are the ones in the repository", () => {
  it("has a string file per locale and no orphan", () => {
    const files = readdirSync(join(repo, "apps/site/src/i18n")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
    expect(files).toEqual(site.LOCALES.map((l) => l.code).sort());
  });
});
