import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_ORIGIN, MODELS_ORIGIN, SITE_ORIGIN } from "@inborn/core";
import { legalUrl } from "../src/lib/legalLinks";
import { GET_APP_URL, STORE_LINKS } from "../src/web/links";

/**
 * F203. The site origin was written out four times — the app's legal links, the web links, the site generator and the
 * Cloudflare deploy — with no two of them reading the same constant. That is the exact shape of the bibleapps
 * widget-domain bug of 24.9, where a purge and a schema URL named a domain that was not the one being deployed.
 */
const repo = join(__dirname, "../../..");
const json = JSON.parse(readFileSync(join(repo, "packages/core/src/site/origins.json"), "utf8")) as { site: string; app: string; models: string };
let siteBuild: { siteOrigin: string; appOrigin: string };

beforeAll(async () => {
  siteBuild = (await import(/* @vite-ignore */ join(repo, "apps/site/build.mjs"))) as { siteOrigin: string; appOrigin: string };
});

describe("F203 · one origin, read by everything that publishes a URL", () => {
  it("core exports exactly what the file says", () => {
    expect([SITE_ORIGIN, APP_ORIGIN, MODELS_ORIGIN]).toEqual([json.site, json.app, json.models]);
    for (const o of [SITE_ORIGIN, APP_ORIGIN, MODELS_ORIGIN]) expect(o, o).toMatch(/^https:\/\/[a-z.]+$/);
  });

  it("the app's legal links and store links are built from it", () => {
    expect(legalUrl("privacy")).toBe(`${SITE_ORIGIN}/privacy`);
    expect(GET_APP_URL).toBe(`${SITE_ORIGIN}/`);
    for (const url of Object.values(STORE_LINKS)) expect(url.startsWith(SITE_ORIGIN), url).toBe(true);
  });

  it("the site generator defaults to it rather than to a host of its own", () => {
    expect([siteBuild.siteOrigin, siteBuild.appOrigin]).toEqual([json.site, json.app]);
  });

  it("the deploy names no origin of its own: the zone and the app host come from the file", () => {
    const deploy = readFileSync(join(repo, "scripts/deploy-cloudflare.mjs"), "utf8");
    const body = deploy.replace(/^\s*\*.*$/gm, "");
    for (const host of [new URL(json.site).host, new URL(json.app).host, new URL(json.models).host]) {
      expect(body.includes(`"https://${host}"`), `${host} is written out in the deploy`).toBe(false);
    }
    expect(body).toContain('origins.json"), "utf8"');
    expect(body).toContain("new URL(SITE_ORIGIN).host");
  });
});
