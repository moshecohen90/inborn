import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, dark, light } from "../../../packages/ui/src/tokens";
import { effectiveDate, legalBody, legalScreen } from "../src/screens/Legal/legalBody";
import { LEGAL_PATHS, SITE_ORIGIN, legalUrl } from "../src/lib/legalLinks";

/**
 * Round 26 (F92–F96). The F51 guard watched `en.json` only, so the four texts that ship as Markdown went unwatched and
 * reached two store binaries with raw `{{…}}` in them. These read the shipped files themselves: the two the app bundles
 * (`Legal.tsx` imports them), the ones the site renders (`apps/site/build.mjs`), and the site's own pages.
 */

const repo = join(__dirname, "../../..");
const legalDir = join(repo, "docs/legal");
const read = (p: string) => readFileSync(join(repo, p), "utf8");

/** The three the app bundles and the site renders: what a user and an App Store reviewer actually read. */
const SHIPPED = ["docs/legal/privacy-policy.md", "docs/legal/terms.md", "docs/legal/accessibility-policy.md"];
/** Everything else under docs/legal that a store submission or the site is built from. */
const LEGAL_MD = readdirSync(legalDir).filter((f) => f.endsWith(".md")).map((f) => `docs/legal/${f}`);
const siteSrc = (dir: string) =>
  readdirSync(join(repo, dir)).filter((f) => f.endsWith(".html")).map((f) => `${dir}/${f}`);
const SITE_PAGES = [...siteSrc("apps/site/src/pages"), ...siteSrc("apps/site/src/posts")];
/** The blog posts live in their own directory under dist, so the walk cannot be one level deep. */
const htmlUnder = (dir: string, base = dir): string[] =>
  readdirSync(join(repo, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlUnder(`${dir}/${e.name}`, base) : e.name.endsWith(".html") ? [`${dir}/${e.name}`] : []);
/* The site is generated, so the guard reads what is served, not the sources it is made from. */
let SITE_DIST: string[] = [];
/** Every token the generator fills, read from the generator so the guard cannot go stale when one is added. */
let SITE_TOKENS: string[] = [];
beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ join(repo, "apps/site/build.mjs"))) as { build: () => string[]; TOKENS: string[] };
  mod.build();
  SITE_TOKENS = mod.TOKENS;
  SITE_DIST = htmlUnder("apps/site/dist");
});

describe("F92 · no placeholder reaches a screen or a page", () => {
  it.each(LEGAL_MD)("%s has no unfilled token", (file) => {
    expect([...read(file).matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0])).toEqual([]);
  });

  /* A fragment may only use a token `build.mjs` exports as one it fills; anything else would ship as literal braces. */
  it.each(SITE_PAGES)("%s carries no token the build does not fill", (file) => {
    const used = [...read(file).matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0]);
    expect(used.filter((t) => !SITE_TOKENS.includes(t.slice(2, -2)))).toEqual([]);
  });

  it("every page the site serves is free of tokens and of the draft notice", () => {
    expect(SITE_DIST.length).toBeGreaterThan(3);
    for (const file of SITE_DIST) {
      expect([...read(file).matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0]), file).toEqual([]);
      expect(read(file), file).not.toMatch(/Status: DRAFT|Not yet published|class="ph"/);
    }
    expect(read("apps/site/dist/privacy.html")).toContain("support@inbornapp.com");
    expect(read("apps/site/dist/privacy.html")).toContain("+1-440-847-8502");
  });

  /* The one token that survives on purpose: the model licence texts carry it and `licenceText()` fills it at render. */
  it("the model licence texts keep {{COPYRIGHT}} and nothing else", () => {
    const texts = readdirSync(join(legalDir, "model-licences")).filter((f) => f.endsWith(".txt"));
    expect(texts.length).toBeGreaterThan(0);
    for (const f of texts) {
      const tokens = new Set([...readFileSync(join(legalDir, "model-licences", f), "utf8").matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0]));
      for (const token of tokens) expect(token, f).toBe("{{COPYRIGHT}}");
    }
  });

  it.each(SHIPPED)("%s no longer opens with a draft notice", (file) => {
    expect(read(file)).not.toMatch(/Status: DRAFT|Not yet published/);
  });

  /* The screen renders `legalBody()`, not the file: this is the exact string the device puts in front of the reader. */
  it.each(SHIPPED)("%s renders on the device with every value filled", (file) => {
    const body = legalBody(read(file));
    expect(body).not.toMatch(/\{\{|Status: DRAFT/);
    expect(body).toContain("support@inbornapp.com");
  });

  /* The identity Moshe settled on 22.9: the Tanach apps' shape — a service-provider name, an email and a phone,
     and no postal address anywhere, because there is no reception to send anyone to. */
  it("the values Moshe had to supply are in the texts, not only in the README", () => {
    const privacy = read("docs/legal/privacy-policy.md");
    const terms = read("docs/legal/terms.md");
    for (const value of ["Cohen Apps", "support@inbornapp.com", "+1-440-847-8502", "22 September 2026"]) {
      expect(privacy, value).toContain(value);
    }
    expect(terms).toContain("governed by Israeli law, and the competent court in Israel has exclusive jurisdiction");
    expect(terms).toContain("https://inbornapp.com/privacy");
    expect(terms).toContain("+1-440-847-8502");
    expect(privacy).toContain("models.inbornapp.com");
  });

  it("no legal text carries a postal address, and none asks the reader to visit one", () => {
    for (const file of [...LEGAL_MD, ...SITE_PAGES]) {
      expect(read(file), file).not.toMatch(/postal address|Rabbi Meir Street|mailing address|in person at/i);
    }
    expect(read("docs/legal/privacy-policy.md")).toMatch(/no physical reception/);
  });
});

describe("F93/F96 · every shipped text says source-available, the way docs/legal/verification.md defines it", () => {
  /* The words `verification.md` forbids are forbidden regardless of whether the repository is public or private:
     the licence is source-available, never "open source". `about.openSource` (the third-party licence screen)
     and this file's own quotations are the only places the words may appear. */
  const FORBIDDEN = /open[- ]source (?:core|client)|published (?:open[- ]source|core)|our open[- ]source|verify the claims in (?:this|the) (?:policy|source)|reproducible build|read in code rather than believed/i;
  const WATCHED = [...LEGAL_MD.filter((f) => !f.endsWith("verification.md")), ...SITE_PAGES, "packages/core/src/work/statement.ts", "apps/site/build.mjs"];

  it.each(WATCHED)("%s claims no source the reader cannot open", (file) => {
    const hit = FORBIDDEN.exec(read(file));
    expect(hit?.[0], `${file} still claims "${hit?.[0]}"`).toBeUndefined();
  });

  it("all four texts that contradicted each other now say the same thing", () => {
    expect(read("docs/legal/terms.md")).toMatch(/Inborn is not open source: its source code is public at github\.com\/moshecohen90\/inborn/);
    expect(read("docs/legal/privacy-policy.md")).toMatch(/Inborn's source code is public at github\.com\/moshecohen90\/inborn/);
    expect(read("apps/site/src/pages/support.html")).toContain("The source is public at");
    expect(read("apps/site/src/pages/support.html")).toContain("github.com/moshecohen90/inborn");
    expect(read("apps/site/src/pages/support.html")).toContain("public issue tracker");
    expect(read("apps/site/src/pages/proof.html")).toMatch(/Inborn's source is public at/);
    expect(read("apps/site/src/pages/proof.html")).toContain("github.com/moshecohen90/inborn");
  });

  /* The complement: the sentence that IS allowed must still be there, or an empty file would pass every check above. */
  it("the site still tells the reader where support lives", () => {
    expect(read("apps/site/src/pages/support.html")).toContain("mailto:support@inbornapp.com");
  });
});

describe("F94 · the policy describes the key store the code actually asks for", () => {
  /* One grep over every source tree that could hold a key request, so the claim is checked against the code, not remembered. */
  const walk = (dir: string): string[] =>
    readdirSync(join(repo, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx|rs|swift|kt|java|m|mm)$/.test(e.name) ? [`${dir}/${e.name}`] : [],
    );
  const sources = ["apps/mobile/src", "apps/desktop/src-tauri/src", "packages/core/src"].flatMap(walk);
  const code = sources.map(read).join("\n");

  it("there is code to check", () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it("nothing in the app requests the Secure Enclave or StrongBox", () => {
    expect(code).not.toMatch(/SecureEnclave|kSecAttrTokenID|setIsStrongBoxBacked|StrongBox/);
  });

  it("so no shipped text may promise them", () => {
    for (const file of [...LEGAL_MD, ...SITE_PAGES]) expect(read(file), file).not.toMatch(/Secure Enclave|StrongBox|hardware-backed/i);
  });

  it("what the policy names is what the code asks for", () => {
    expect(code).toContain("WHEN_UNLOCKED_THIS_DEVICE_ONLY");
    const privacy = read("docs/legal/privacy-policy.md");
    expect(privacy).toMatch(/iOS Keychain, with the `WhenUnlockedThisDeviceOnly` attribute/);
    expect(privacy).toMatch(/Android Keystore/);
  });
});

describe("F95 · the policy's incognito sentence matches what the code does with an attached file", () => {
  it("it no longer says a file is never written to disk", () => {
    const line = read("docs/legal/privacy-policy.md").split("\n").find((l) => l.includes("**Incognito chats**"))!;
    expect(line).not.toMatch(/never written to disk/);
    expect(line).toMatch(/held in a temporary location for the length of the session/);
    expect(line).toMatch(/deleted when the session ends/);
  });

  it("and the code it describes exists: a cache directory, and a sweep on the next launch", () => {
    expect(read("apps/mobile/src/documents/files.native.ts")).toMatch(/new Directory\(Paths\.cache, "incognito"\)/);
    expect(read("apps/mobile/src/documents/library.ts")).toContain("sweepIncognitoFiles()");
  });
});

describe("F97 · the metadata block the screen shows above the text", () => {
  /* What the device puts in front of the reader: the metadata lines under the title, then the body. The F96 guard
     above reads the FILE, which is why Terms could ship naming no licensor, no phone and no effective date. */
  const rendered = (file: string) => {
    const { meta, body } = legalScreen(read(file));
    return [...meta, body].join("\n");
  };

  it.each(SHIPPED)("%s renders the licensor, the email, the phone and the effective date", (file) => {
    const text = rendered(file);
    const date = effectiveDate(read(file));
    expect(date, `${file} states no effective date`).not.toBeNull();
    for (const value of ["Cohen Apps", "support@inbornapp.com", "+1-440-847-8502", date!]) {
      expect(text, `${file} renders no "${value}"`).toContain(value);
    }
  });

  /* The complement: Terms passed the line above only because of the block, not because some section repeats it. */
  it.each(SHIPPED)("%s carries the identity in the block itself", (file) => {
    const meta = legalScreen(read(file)).meta.join("\n");
    expect(meta, file).toContain("Cohen Apps");
    expect(meta, file).toContain("support@inbornapp.com");
    expect(meta, file).toContain(`Effective date: ${effectiveDate(read(file))}`);
  });

  it("the block is read from the file, never written into the screen", () => {
    const screen = read("apps/mobile/src/screens/Legal/Legal.tsx");
    expect(screen).toMatch(/legalScreen\(/);
    expect(screen).toMatch(/meta\.map/);
    expect(screen).toMatch(/source=\{body\}/);
    for (const value of ["Cohen Apps", "inbornapp.com", "+1-440"]) expect(screen, `Legal.tsx hardcodes "${value}"`).not.toContain(value);
  });

  it("it takes the facts a header block states and nothing else", () => {
    const doc = [
      "# A title",
      "",
      "Spec basis: §1. Last edited 1 January 2026.",
      "",
      "**Status: DRAFT**",
      "",
      "Effective date: 2 February 2026",
      "Licensor: Someone Else Ltd",
      "Contact: a@b.example or +1-000-000-0000.",
      "",
      "A paragraph that states no fact of its own.",
      "",
      "## 1. First section",
      "",
      "body",
    ].join("\n");
    expect(legalScreen(doc).meta).toEqual(["Effective date: 2 February 2026", "Licensor: Someone Else Ltd", "Contact: a@b.example or +1-000-000-0000."]);
    expect(legalScreen(doc).body).toBe("## 1. First section\n\nbody");
  });

  it.each(SHIPPED)("%s keeps the edit note and any draft banner out of the block", (file) => {
    const { meta } = legalScreen(read(file));
    expect(meta.length, file).toBeGreaterThan(1);
    expect(meta.join("\n"), file).not.toMatch(/Spec basis|Last edited|Status:/);
  });

  it("a text with no header block gets no empty block", () => {
    expect(legalScreen("## 1. Only\n\nbody").meta).toEqual([]);
    expect(legalBody("## 1. Only\n\nbody")).toBe("## 1. Only\n\nbody");
  });
});

/**
 * Round 42 (F155–F157). Moshe: the policies in the app must come from the site so they can be updated, and the site
 * needs an accessibility policy. The app cannot fetch them — Android has no INTERNET permission (D3) — so the bundled
 * copy stays, labelled as a copy, and every legal screen offers the live page through the system browser.
 */

describe("F155 · every legal document in the app has a live page to open", () => {
  const screens = {
    privacy: read("apps/mobile/src/screens/Legal/Legal.tsx"),
    terms: read("apps/mobile/src/screens/Legal/Legal.tsx"),
    licenses: read("apps/mobile/src/screens/About/Licenses.tsx"),
    accessibility: read("apps/mobile/src/screens/Legal/Legal.tsx"),
  };

  it("the link map covers exactly the four documents, all on inbornapp.com", () => {
    expect(Object.keys(LEGAL_PATHS).sort()).toEqual(["accessibility", "licenses", "privacy", "terms"]);
    expect(SITE_ORIGIN).toBe("https://inbornapp.com");
    for (const doc of Object.keys(LEGAL_PATHS) as (keyof typeof LEGAL_PATHS)[]) {
      expect(legalUrl(doc)).toBe(`https://inbornapp.com${LEGAL_PATHS[doc]}`);
    }
  });

  /* The whole point of the round: a path the app sends a user to must be a page the site actually serves. */
  it("every path the app opens is a page the site build produces", () => {
    for (const path of Object.values(LEGAL_PATHS)) {
      expect(SITE_DIST, `the site serves no ${path}`).toContain(`apps/site/dist${path}.html`);
    }
  });

  it("the screen that shows a document is the screen that offers its live page", () => {
    /* The rendered element, not the import: an unused import would otherwise satisfy this. */
    for (const [doc, src] of Object.entries(screens)) expect(src, `${doc}'s screen offers no live page`).toMatch(/<LegalSource\b/);
    const source = read("apps/mobile/src/components/LegalSource.tsx");
    expect(source).toContain("legalUrl(doc)");
    expect(source).toContain("Linking.openURL");
    /* Not a fetch: the app has no network path on Android, so the live text is only ever read in the system browser. */
    expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|axios/);
  });

  it("no legal screen fetches a policy over the network", () => {
    for (const file of ["apps/mobile/src/screens/Legal/Legal.tsx", "apps/mobile/src/screens/About/Licenses.tsx", "apps/mobile/src/components/LegalSource.tsx"]) {
      expect(read(file), file).not.toMatch(/\bfetch\(|XMLHttpRequest/);
    }
  });

  it("the bundled text is labelled a copy, with the date it is effective from", () => {
    const en = JSON.parse(read("packages/i18n/locales/en.json")) as Record<string, string>;
    expect(en["legal.offlineCopy"]).toMatch(/\{date\}/);
    expect(en["legal.offlineCopy"]!.toLowerCase()).toContain("offline copy");
    expect(en["legal.readCurrent"]).toMatch(/\{url\}/);
    expect(read("apps/mobile/src/screens/Legal/Legal.tsx")).toContain("legal.offlineCopy");
  });

  /* The identity guard (F97) still holds: the screen states no fact of its own, it renders the file's. */
  it("the screen still hardcodes no identity", () => {
    const screen = read("apps/mobile/src/screens/Legal/Legal.tsx");
    for (const value of ["Cohen Apps", "inbornapp.com", "+1-440"]) expect(screen, `Legal.tsx hardcodes "${value}"`).not.toContain(value);
  });

  it("the accessibility statement is reachable from the app's legal index", () => {
    const about = read("apps/mobile/src/screens/About/About.tsx");
    expect(about).toContain('router.push("/legal/accessibility")');
    expect(about).toContain("legal.accessibility");
  });

  it("the site links it from every page's footer", () => {
    for (const file of SITE_DIST) expect(read(file), file).toContain('href="/accessibility"');
  });
});

describe("F156 · the site's palette is held to the same contrast rule as the app's", () => {
  /* The statement tells the reader the site meets the app's contrast rule. The site hard-copies the palette instead
     of importing the tokens, and `--text-3` had already drifted to a value that fails AA on every dark surface. */
  const css = read("apps/site/src/site.css");
  const scheme = (block: string): Record<string, string> =>
    Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1]!, m[2]!.toUpperCase()]));
  const darkCss = scheme(/:root\s*\{([\s\S]*?)\}/.exec(css)![1]!);
  const lightCss = scheme(/@media \(prefers-color-scheme: light\)\s*\{\s*:root\s*\{([\s\S]*?)\}/.exec(css)![1]!);
  const PAIRS: [string, keyof typeof dark][] = [
    ["bg", "bg"], ["surface-1", "surface1"], ["surface-2", "surface2"], ["well", "well"],
    ["border", "border"], ["text", "text"], ["text-2", "text2"], ["text-3", "text3"],
    ["accent", "accent"], ["sealed", "sealed"], ["danger", "danger"], ["cta-fill", "ctaFill"], ["cta-text", "ctaText"],
  ];

  it("reads both schemes out of the stylesheet", () => {
    expect(Object.keys(darkCss).length).toBeGreaterThan(10);
    expect(Object.keys(lightCss).length).toBeGreaterThan(10);
  });

  it.each(PAIRS)("--%s is the app's token", (cssName, token) => {
    expect(darkCss[cssName], `dark --${cssName}`).toBe(dark[token].toUpperCase());
    expect(lightCss[cssName], `light --${cssName}`).toBe(light[token].toUpperCase());
  });

  /* The complement: equality above would pass on a palette that is equally bad, so the ratios are asserted too. */
  it.each(["text", "text-2", "text-3"])("--%s reaches 4.5:1 on every surface the site puts it on", (ink) => {
    for (const [name, colours] of [["dark", darkCss], ["light", lightCss]] as const) {
      for (const surface of ["bg", "surface-1", "surface-2", "well"]) {
        expect(contrastRatio(colours[ink]!, colours[surface]!), `${name} --${ink} on --${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("F157 · the accessibility statement matches the code it describes", () => {
  const policy = read("docs/legal/accessibility-policy.md");

  /* F157 declared this gap and F109 closed it. Section 7 promises the bullet leaves in the same change as the fix,
     so the two are asserted together: a colour that falls back under 4.5 fails here, and so does a statement that
     starts admitting a gap the tokens no longer have. */
  it("the delete/wipe contrast is fixed, and the statement no longer claims otherwise", () => {
    expect(contrastRatio(dark.onDanger, dark.danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.onDanger, light.danger)).toBeGreaterThanOrEqual(4.5);
    expect(policy).not.toMatch(/delete and wipe buttons fail the contrast rule/);
    expect(policy).not.toMatch(/\*\*3\.1:1\*\*/);
  });

  /* F108 closed the other one: Enter sends in a browser and on the desktop shell. */
  it("the hardware-keyboard gap is closed, and the statement no longer claims it", () => {
    expect(policy).not.toMatch(/cannot send a message from a hardware keyboard/i);
    expect(policy).toMatch(/Enter sends/);
  });

  it("the gap list still matches the ink tokens that do pass, so the statement is not blanket-pessimistic", () => {
    for (const theme of [dark, light]) {
      for (const surface of [theme.bg, theme.surface1, theme.surface2, theme.well]) {
        for (const ink of [theme.text, theme.text2, theme.text3]) expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("names its standard, its law and a way to complain", () => {
    expect(policy).toContain("WCAG 2.2");
    expect(policy).toContain("5758-1998");
    expect(policy).toContain("support@inbornapp.com");
    expect(policy).toContain("+1-440-847-8502");
    expect(policy).toContain("Effective date: 23 September 2026");
  });

  /* Claims the review of 23.9 struck out must not creep back: each one was false against the code. */
  it("makes none of the claims the code does not support", () => {
    expect(policy).not.toMatch(/fails the build/);
    expect(policy).not.toMatch(/one completed sentence at a time/);
    expect(policy).not.toMatch(/a target never falls below/);
    expect(policy).not.toMatch(/Every text style in the app/);
  });
});

/**
 * Round 48 (F207, F209, F214). The site published three things the rest of the repository already contradicted:
 * an absolute zero-bytes-out claim nine lines above the download it admits to, a promise of per-release hashes that
 * `verification.md` forbids, and British spelling on pages whose app screens and US storefront are American.
 */
describe("F207/F209/F214 · what the site may not go back to saying", () => {
  const SITE_TEXT = [...SITE_PAGES, "apps/site/build.mjs", "apps/site/src/site.css"];

  it("no page makes the exit meter an absolute", () => {
    for (const file of SITE_TEXT) expect(read(file), file).not.toMatch(/for the life of the install/i);
  });

  /* The complement: the sentence is still there, with the qualifier, on both pages that carry the meter. */
  it("both meter sentences carry the honest qualifier", () => {
    for (const file of ["apps/site/src/pages/index.html", "apps/site/src/pages/proof.html"]) {
      expect(read(file), file).toMatch(/0 B<\/span> unless you start a model download yourself/);
    }
  });

  it("no page promises a hash of every released build", () => {
    for (const file of SITE_TEXT) expect(read(file), file).not.toMatch(/lists the SHA-256 of every released build|per-release hash(?!, because)/i);
    expect(read("apps/site/src/pages/proof.html")).toContain("We do not publish a per-release hash, because");
  });

  it("the site spells license, quantization and math the way the app screens and the US storefront do", () => {
    for (const file of SITE_TEXT) expect(read(file), file).not.toMatch(/\blicences?\b|\bquantis(?:ation|ed)\b|\bmaths\b|\bsummaris|data centre/i);
  });

  /* review-design 18: the one em dash left in a text the app renders on a device. */
  it("no shipped legal text carries an em dash", () => {
    for (const file of SHIPPED) expect(read(file), file).not.toContain("\u2014");
  });

  /* The EULA keeps British wording, but its pointer at a screen must name the screen: `about.licenses` reads LICENSES. */
  it("the terms point at the screen the app actually shows", () => {
    const terms = read("docs/legal/terms.md");
    expect(terms).toContain("Settings → About → Licenses");
    expect(terms).not.toMatch(/Settings → (?:About → )?Licences/);
  });
  /**
   * F296. "Publisher: Cohen Apps (the developer account shown on the store listing)" is true on Google Play and false
   * on the App Store, where the single-person account reads "Moshe Cohen". The name stays; the promise about the
   * listing does not, because no one text can make it true on both stores.
   */
  it("no shipped text promises that a name is what the store listing shows", () => {
    for (const file of [...SHIPPED, ...SITE_TEXT]) expect(read(file), file).not.toMatch(/the developer account shown on the store listing/i);
    expect(read("docs/legal/privacy-policy.md")).toContain("Publisher: Cohen Apps\n");
    expect(read("docs/legal/accessibility-policy.md")).toContain("Owner: Cohen Apps\n");
  });
});

/**
 * F319. /compare states facts about other companies' products, which is the one page on this site where being wrong
 * is a legal and a reputational problem rather than a typo. Two claims were removed while it was written, each
 * because a source contradicted it, and these are the guards that stop them coming back.
 */
describe("F319 · what /compare may not go back to saying", () => {
  const COMPARE = ["apps/site/src/pages/compare.html", "apps/site/build.mjs"];
  /** The six release manifests we actually read, named on the page so the permission claim carries its own scope. */
  const READ_MANIFESTS = ["PocketPal AI", "MLC Chat", "Google AI Edge Gallery", "SmolChat", "LLM Hub", "MyDeviceAI"];

  /* openai.com and help.openai.com returned 403 to every fetch on 24.9.2026, so nothing on the page is sourced to
     OpenAI. A price we could not read and cannot re-check would go stale silently and take the page's credibility. */
  it("no page quotes a price for ChatGPT", () => {
    for (const file of COMPARE) {
      const text = read(file);
      expect(text, file).not.toMatch(/(ChatGPT|OpenAI)[^.!?]{0,120}(\$\s?\d|\d+(?:\.\d+)?\s?USD)/i);
      expect(text, file).not.toMatch(/(\$\s?\d|\d+(?:\.\d+)?\s?USD)[^.!?]{0,120}(ChatGPT|OpenAI)/i);
    }
    expect(read("apps/site/src/pages/compare.html")).toContain("prints no ChatGPT price");
  });

  /* We read six Android manifests and all six declare INTERNET. "No competitor ships without it" would be a claim
     about apps whose source is closed, which is exactly the kind of sentence this category punishes. */
  it("the INTERNET permission claim never drops its scope", () => {
    for (const file of COMPARE) {
      expect(read(file), file).not.toMatch(/(no|not a single|the only) (other )?(app|competitor|rival)[^.!?]{0,80}INTERNET/i);
      expect(read(file), file).not.toMatch(/INTERNET[^.!?]{0,80}(no|not a single) (other )?(app|competitor|rival)/i);
    }
    const page = read("apps/site/src/pages/compare.html");
    for (const name of READ_MANIFESTS) expect(page, name).toContain(name);
  });
});
