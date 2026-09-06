import { describe, expect, it } from "vitest";
import { FORBIDDEN_CLAIMS, PACKS, PACK_IDS, fillTemplate, findPack, packClaimsAreHonest, placeholdersOf } from "../src/work/packs";
import { architectureStatement } from "../src/work/statement";

describe("profession packs (spec §7.6 templates, §7.9 Work)", () => {
  it("ships the four packs, each with a declaration and templates whose placeholders are well-formed", () => {
    expect(PACK_IDS).toEqual(["legal", "therapy", "medical", "accounting"]);
    for (const pack of PACKS) {
      expect(pack.declaration.length, pack.id).toBeGreaterThan(200);
      expect(pack.declaration, pack.id).toMatch(/leaves? it|never leave/);
      expect(pack.templates.length, pack.id).toBeGreaterThanOrEqual(4);
      const ids = new Set<string>();
      for (const t of pack.templates) {
        expect(ids.has(t.id), `${pack.id}/${t.id} duplicate`).toBe(false);
        ids.add(t.id);
        const slots = placeholdersOf(t.body);
        expect(slots.length, `${pack.id}/${t.id}`).toBeGreaterThan(0);
        for (const s of slots) expect(s, `${pack.id}/${t.id}`).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
    expect(findPack("legal")?.name).toBe("Legal");
    expect(findPack("nope")).toBeUndefined();
  });

  it("never claims compliance, privilege, certification or guarantees (§7.9)", () => {
    for (const pack of PACKS) expect(packClaimsAreHonest(pack), pack.id).toBe(true);
    const dishonest = { ...PACKS[0]!, declaration: "This tool is HIPAA-compliant." };
    expect(packClaimsAreHonest(dishonest)).toBe(false);
    expect(FORBIDDEN_CLAIMS.some((re) => re.test("privileged communication"))).toBe(true);
  });

  it("fills placeholders and leaves the missing ones visible", () => {
    const body = "Client: {{client_name}}\nMatter: {{ matter }}\nAgain: {{client_name}}";
    expect(placeholdersOf(body)).toEqual(["client_name", "matter"]);
    expect(fillTemplate(body, { client_name: "Acme", matter: "" })).toBe("Client: Acme\nMatter: [matter]\nAgain: Acme");
    expect(fillTemplate(body, {})).toBe("Client: [client name]\nMatter: [matter]\nAgain: [client name]");
  });
});

describe("architecture statement (spec §7.5 Work)", () => {
  it("is dated, platform-specific, lists vaults and the signing key, and disclaims certification", () => {
    const md = architectureStatement({ appVersion: "0.1.0", buildHash: "9f2a…c41e", platform: "android", date: "2026-09-07", tier: "work", modelName: "Fast", vaults: ["Client A", "Case 12"], signingPublicKeyHex: "ab".repeat(32) });
    expect(md).toContain("Date: 2026-09-07");
    expect(md).toContain("no INTERNET permission");
    expect(md).toContain("- Client A\n- Case 12");
    expect(md).toContain("ab".repeat(32));
    expect(md).toContain("Pro for Work");
    expect(md).toContain("not a certification of compliance");
    expect(md).not.toMatch(/HIPAA[- ]compliant/i);
    const ios = architectureStatement({ appVersion: "0.1.0", platform: "ios", date: "2026-09-07", tier: "free" });
    expect(ios).toContain("iOS Keychain");
    expect(ios).toContain("- none");
    expect(ios).toContain("no signing key yet");
  });
});
