import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { EN, build, LOCALES } from "../../../apps/site/build.mjs";
import {
  MD_LEGAL_PAGES,
  judgeLicenseDrift,
  legalWordDiff,
  liveLegalWords,
  liveLicenseModelNames,
  repoLegalWords,
  repoLicenseModelNames,
} from "../../../scripts/check-live-legal.mjs";

/**
 * F364. `apps/site/build.mjs` is a real generator, not a fixture author, so these tests build the real site once
 * and read its real output — the same bytes a browser gets from inbornapp.com — rather than hand-writing HTML that
 * could drift from what build.mjs actually emits. The guard itself (scripts/check-live.mjs) fetches that HTML over
 * the network; these tests exercise the pure comparators it calls, which is also what a fixture-sabotage can watch
 * fail without a live origin.
 */
const dist = mkdtempSync(path.join(tmpdir(), "inborn-legal-guard-"));
build({ out: dist });
afterAll(() => rmSync(dist, { recursive: true, force: true }));

const readPage = (locale: (typeof LOCALES)[number], route: string) => {
  const rel = route === "/" ? "index.html" : `${route.slice(1)}.html`;
  const dir = locale.dir ? path.join(dist, locale.dir) : dist;
  return readFileSync(path.join(dir, rel), "utf8");
};

describe("legal-text guard: green path (real build output)", () => {
  for (const locale of LOCALES) {
    for (const [route, mdFile] of MD_LEGAL_PAGES as [string, string][]) {
      it(`${locale.code} ${route} matches docs/legal/${mdFile} word for word`, () => {
        const html = readPage(locale, route);
        const diff = legalWordDiff(liveLegalWords(html), repoLegalWords(mdFile));
        expect(diff).toBeNull();
      });
    }
  }

  it("licenses page's model list matches docs/legal/NOTICE.json in every locale", () => {
    for (const locale of LOCALES) {
      const liveNames = liveLicenseModelNames(readPage(locale, "/licenses"));
      expect(liveNames).toEqual(repoLicenseModelNames());
    }
  });

  it("judges a matching model list as ok regardless of catalog version", () => {
    const names = repoLicenseModelNames();
    expect(judgeLicenseDrift({ liveNames: names, repoNames: names, liveCatalogVersion: 3, repoCatalogVersion: 6 })).toEqual({ level: "ok" });
  });
});

describe("legal-text guard: red path (sabotaged fixture)", () => {
  it("catches a single drifted word in the privacy article", () => {
    const html = readPage(EN!, "/privacy");
    /* "We do not collect ... any personal data" is the load-bearing sentence of the whole policy; flipping one
       word in it is the smallest realistic drift (a future edit that changes meaning by one word) the guard must not miss. */
    expect(html).toContain("We do not collect, receive, store, sell or share any personal data.");
    const sabotaged = html.replace("We do not collect, receive, store, sell or share any personal data.", "We do sometimes collect, receive, store, sell or share any personal data.");
    const diff = legalWordDiff(liveLegalWords(sabotaged), repoLegalWords("privacy-policy.md"));
    expect(diff).not.toBeNull();
    expect(diff).toContain("sometimes");
  });

  it("stays green when only the maintainer's Spec-basis line and H1 differ (both are meant to be stripped)", () => {
    const repoWords = repoLegalWords("terms.md");
    expect(repoWords).not.toContain("basis");
    const html = readPage(EN!, "/terms");
    expect(html).not.toContain("Spec basis");
  });

  it("flags a real licenses drift (old model still live) as fail once the catalog has already shipped", () => {
    const html = readPage(EN!, "/licenses");
    const staleHtml = html.replace(">multilingual-e5-large-instruct<", ">nomic-embed-text<");
    const liveNames = liveLicenseModelNames(staleHtml);
    const repoNames = repoLicenseModelNames();
    expect(liveNames).not.toEqual(repoNames);
    expect(judgeLicenseDrift({ liveNames, repoNames, liveCatalogVersion: 7, repoCatalogVersion: 7 }).level).toBe("fail");
  });

  it("downgrades the same licenses drift to a warn while the live catalog is still behind the repo (Deploy has not shipped it yet)", () => {
    const html = readPage(EN!, "/licenses");
    const staleHtml = html.replace(">multilingual-e5-large-instruct<", ">nomic-embed-text<");
    const liveNames = liveLicenseModelNames(staleHtml);
    const repoNames = repoLicenseModelNames();
    expect(judgeLicenseDrift({ liveNames, repoNames, liveCatalogVersion: 5, repoCatalogVersion: 6 }).level).toBe("warn");
  });

  it("also warns, rather than fails, when the live catalog version could not be read at all", () => {
    const html = readPage(EN!, "/licenses");
    const staleHtml = html.replace(">multilingual-e5-large-instruct<", ">nomic-embed-text<");
    const liveNames = liveLicenseModelNames(staleHtml);
    const repoNames = repoLicenseModelNames();
    expect(judgeLicenseDrift({ liveNames, repoNames, liveCatalogVersion: null, repoCatalogVersion: 6 }).level).toBe("warn");
  });
});
