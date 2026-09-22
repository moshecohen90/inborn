import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COPYRIGHT_PLACEHOLDER, hasLicenceText, licenceText } from "../src";

/**
 * F54 · gap 20: the Licences screen showed a name, an attribution and a link. Apache-2.0 §4(d) and MIT both
 * want the text to travel with the distribution, and the app's whole point is that it works with no network,
 * so a link discharges nothing. These tests keep the bundled bytes equal to the files an auditor reads.
 */

const dir = join(__dirname, "../../../docs/legal/model-licences");
const file = (name: string) => readFileSync(join(dir, name), "utf8");
const notice = JSON.parse(readFileSync(join(__dirname, "../../../docs/legal/NOTICE.json"), "utf8")) as {
  components: { id: string; group: string; license: string; attribution?: string; licenseUrl?: string; restrictions?: string[]; scope: string }[];
};

describe("the bundled texts are the files on disk", () => {
  it("Apache-2.0 is the canonical text, byte for byte", () => {
    expect(licenceText("Apache-2.0")).toBe(file("apache-2.0.txt"));
  });
  it("MIT is the file with the holder's own copyright line put in", () => {
    expect(licenceText("MIT", "Copyright (c) Microsoft Corporation. MIT License")).toBe(file("mit.txt").replace(COPYRIGHT_PLACEHOLDER, "Copyright (c) Microsoft Corporation. MIT License"));
    expect(licenceText("MIT", "Copyright (c) Microsoft Corporation. MIT License")).not.toContain(COPYRIGHT_PLACEHOLDER);
  });
  it("never leaves the placeholder on screen when a component has no attribution", () => {
    expect(licenceText("MIT")).not.toContain(COPYRIGHT_PLACEHOLDER);
    expect(licenceText("MIT", "   ")).not.toContain(COPYRIGHT_PLACEHOLDER);
  });
});

/* "not redistributed" marks an OS capability (Apple Foundation Models, Gemini Nano): we ship no file for it, so no text of ours can travel with it. */
const distributed = (c: { group: string; scope: string; restrictions?: string[] }) => c.group === "model" && /^(shipped|catalogue)/.test(c.scope) && !c.restrictions?.includes("not redistributed");

describe("every model we distribute has a text to show", () => {
  const shipping = notice.components.filter(distributed);
  it("there is something to check", () => {
    expect(shipping.length).toBeGreaterThan(5);
  });
  it.each(shipping.map((c) => [c.id, c.license, c.attribution] as const))("%s (%s) resolves to a bundled text", (_id, license, attribution) => {
    const text = licenceText(license, attribution);
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(500);
  });
});

describe("a licence we do not ship a text for falls back to the link", () => {
  it("returns null rather than an empty page", () => {
    expect(hasLicenceText("CC-BY-4.0")).toBe(false);
    expect(licenceText("CC-BY-4.0", "NVIDIA, CC BY 4.0")).toBeNull();
    expect(licenceText("Gemma Terms of Use")).toBeNull();
  });
  it("every such component in NOTICE.json still carries a URL, so the screen has something to offer", () => {
    for (const c of notice.components.filter((c) => c.group === "model" && !hasLicenceText(c.license) && /^(shipped|catalogue)/.test(c.scope))) {
      /* Includes the OS capabilities above: those need a link most of all, because we have nothing else to give. */
      expect(c.licenseUrl ?? "", c.id).toMatch(/^https:/);
    }
  });
});
