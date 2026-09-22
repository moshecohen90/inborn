import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { legalBody } from "../src/screens/Legal/legalBody";

/**
 * Round 26 (F92–F96). The F51 guard watched `en.json` only, so the four texts that ship as Markdown went unwatched and
 * reached two store binaries with raw `{{…}}` in them. These read the shipped files themselves: the two the app bundles
 * (`Legal.tsx` imports them), the ones the site renders (`apps/site/build.mjs`), and the site's own pages.
 */

const repo = join(__dirname, "../../..");
const legalDir = join(repo, "docs/legal");
const read = (p: string) => readFileSync(join(repo, p), "utf8");

/** The two the app bundles and the site renders: what a user and an App Store reviewer actually read. */
const SHIPPED = ["docs/legal/privacy-policy.md", "docs/legal/terms.md"];
/** Everything else under docs/legal that a store submission or the site is built from. */
const LEGAL_MD = readdirSync(legalDir).filter((f) => f.endsWith(".md")).map((f) => `docs/legal/${f}`);
const SITE_PAGES = readdirSync(join(repo, "apps/site/src/pages")).filter((f) => f.endsWith(".html")).map((f) => `apps/site/src/pages/${f}`);
/* The site is generated, so the guard reads what is served, not the sources it is made from. */
let SITE_DIST: string[] = [];
beforeAll(async () => {
  const { build } = (await import(/* @vite-ignore */ join(repo, "apps/site/build.mjs"))) as { build: () => string[] };
  build();
  SITE_DIST = readdirSync(join(repo, "apps/site/dist")).filter((f) => f.endsWith(".html")).map((f) => `apps/site/dist/${f}`);
});

describe("F92 · no placeholder reaches a screen or a page", () => {
  it.each(LEGAL_MD)("%s has no unfilled token", (file) => {
    expect([...read(file).matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0])).toEqual([]);
  });

  /* `{{SEAL}}` is the one token the generator itself fills, with the inline seal SVG. */
  it.each(SITE_PAGES)("%s carries no token the build does not fill", (file) => {
    expect([...read(file).matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0]).filter((t) => t !== "{{SEAL}}")).toEqual([]);
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
  /* The list `verification.md` forbids while the repository is private. `about.openSource` (the third-party licence
     screen) and this file's own quotations are the only places the words may appear. */
  const FORBIDDEN = /open[- ]source (?:core|client)|published (?:open[- ]source|core)|our open[- ]source|verify the claims in (?:this|the) (?:policy|source)|reproducible build|read in code rather than believed/i;
  const WATCHED = [...LEGAL_MD.filter((f) => !f.endsWith("verification.md")), ...SITE_PAGES, "packages/core/src/work/statement.ts", "apps/site/build.mjs"];

  it.each(WATCHED)("%s claims no source the reader cannot open", (file) => {
    const hit = FORBIDDEN.exec(read(file));
    expect(hit?.[0], `${file} still claims "${hit?.[0]}"`).toBeUndefined();
  });

  it("all three texts that contradicted each other now say the same thing", () => {
    expect(read("docs/legal/terms.md")).toMatch(/Inborn is not open source: its source code is not public/);
    expect(read("docs/legal/privacy-policy.md")).toMatch(/Inborn's source code is not public/);
    expect(read("apps/site/src/pages/support.html")).toMatch(/source is not public, so there is no public issue tracker/);
    expect(read("apps/site/src/pages/proof.html")).toMatch(/Inborn's source code is not public/);
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
