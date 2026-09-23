import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * F200. The site gate's script-src check was rewritten from "every script-src must be 'none'" to "the literal appears
 * once", which passes a `_headers` whose later per-path block re-allows scripts. §13.4 is zero third-party JS on every
 * path, not on the first one.
 */
const repo = join(__dirname, "../../..");
let headerProblems: (headers: string) => string[];
beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ join(repo, "apps/site/headerCheck.mjs"))) as { headerProblems: (h: string) => string[] };
  headerProblems = mod.headerProblems;
});

const TEMPLATE = () => readFileSync(join(repo, "apps/site/public/_headers"), "utf8").replace(/\{\{APP_ORIGIN\}\}/g, "https://app.inbornapp.com");

describe("F200 · the site's script-src gate", () => {
  it("passes the headers the site actually ships", () => {
    expect(headerProblems(TEMPLATE())).toEqual([]);
  });

  it("fails a later per-path block that re-allows scripts", () => {
    const weakened = `${TEMPLATE()}\n/blog/*\n  Content-Security-Policy: default-src 'none'; script-src 'self'\n`;
    expect(headerProblems(weakened)).toEqual([expect.stringContaining("script-src must be 'none', not 'self'")]);
  });

  it("fails an unsafe-inline or a host allow-list wherever it appears", () => {
    for (const value of ["'unsafe-inline'", "https://cdn.example.com", "'self' 'wasm-unsafe-eval'"]) {
      const weakened = TEMPLATE().replace("script-src 'none'", `script-src ${value}`);
      expect(headerProblems(weakened).join(" "), value).toContain("script-src");
    }
  });

  it("still fails a file that dropped the directive or the base policy", () => {
    expect(headerProblems(TEMPLATE().replace("script-src 'none'; ", ""))).toEqual([expect.stringContaining("script-src must be 'none'")]);
    expect(headerProblems(TEMPLATE().replace("default-src 'none'", "default-src 'self'"))).toEqual([expect.stringContaining("default-src 'none'")]);
  });

  it("keeps the form-action rule: 'none' or one https origin", () => {
    expect(headerProblems(TEMPLATE().replace("form-action https://app.inbornapp.com", "form-action *"))).toEqual([expect.stringContaining("form-action")]);
    expect(headerProblems(TEMPLATE().replace("form-action https://app.inbornapp.com", "form-action 'none'"))).toEqual([]);
  });
});
