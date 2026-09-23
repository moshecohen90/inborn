import { beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * F202. One HTML document serves every route, and that rule was written three times: a Pages-style `_redirects` the
 * Workers-assets deploy ignores, the Worker's `not_found_handling`, and the dev server. The deploy setting governs;
 * `_redirects` is gone, and the dev server is the same rule for a local origin.
 */
const repo = join(__dirname, "../../..");
let resolveFile: (urlPath: string, o: { dist: string; modelsDir: string; aliases: Record<string, string> }) => string | null;
let dist = "";

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ join(repo, "scripts/serve-web.mjs"))) as { resolveFile: typeof resolveFile };
  resolveFile = mod.resolveFile;
  dist = mkdtempSync(join(tmpdir(), "inborn-web-"));
  writeFileSync(join(dist, "index.html"), "<html></html>");
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "assets", "app.js"), "//");
});

const at = (p: string) => resolveFile(p, { dist, modelsDir: dist, aliases: {} });

describe("F202 · the one-document rule", () => {
  it("answers a shared deep link with the one document", () => {
    for (const route of ["/", "/paywall", "/chat/abc", "/settings/legal"]) expect(at(route), route).toBe(join(dist, "index.html"));
  });

  it("serves a real file as itself", () => {
    expect(at("/assets/app.js")).toBe(join(dist, "assets", "app.js"));
  });

  it("does not turn a missing asset into the document", () => {
    for (const p of ["/assets/gone.js", "/favicon.ico"]) expect(at(p), p).toBeNull();
  });

  it("never answers with a file outside dist", () => {
    /* An extensionless path is the document (that is the rule); one that names a file must resolve inside dist or not at all. */
    expect(at("/../../etc/passwd")).toBe(join(dist, "index.html"));
    for (const p of ["/../secret.txt", "/../../etc/hosts.json", "/assets/../../outside.js"]) {
      const file = at(p);
      expect(file === null || file.startsWith(dist), p).toBe(true);
    }
  });

  it("the deploy carries the rule, and the build no longer writes a second copy", () => {
    const deploy = readFileSync(join(repo, "scripts/deploy-cloudflare.mjs"), "utf8");
    expect(deploy).toMatch(/hostnames: \[APP_HOST\][\s\S]{0,140}notFoundHandling: "single-page-application"/);
    /* The site is a set of pages, not one document: its own 404 must keep answering. */
    expect(deploy).toMatch(/notFoundHandling: "404-page"/);
    expect(readFileSync(join(repo, "apps/web/build.mjs"), "utf8"), "a Pages _redirects the Workers deploy ignores").not.toContain("_redirects");
  });
});
