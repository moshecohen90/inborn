import { describe, expect, it } from "vitest";
import { crisisResources, detectCrisis } from "../src";

/**
 * F56 · gap 33: the crisis card (§8.2 S14, §10.5 #37) had phrases for six of the eight shipped UI languages.
 * A Korean or Taiwanese user writing that they want to die got no card at all. These tests hold the line for
 * all eight, and for the hotlines those two locales need.
 */

/* One ordinary sentence per language alongside each crisis one: a list that matched everything would also "pass". */
const SHIPPED: [locale: string, crisis: string, ordinary: string][] = [
  ["en", "I want to die", "How do I bake bread"],
  ["de", "Ich will nicht mehr leben", "Wie backe ich Brot"],
  ["fr", "Je veux mourir", "Comment faire du pain"],
  ["es", "Quiero morir", "Cómo hacer pan"],
  ["pt-BR", "Quero morrer", "Como fazer pão"],
  ["ja", "死にたい", "パンの焼き方を教えて"],
  ["ko", "죽고 싶어요", "빵 만드는 법 알려줘"],
  ["zh-Hant", "我不想活了", "請教我做麵包"],
];

describe("crisis detection covers every shipped UI language", () => {
  it.each(SHIPPED)("%s: detects the crisis phrase", (_locale, crisis) => {
    expect(detectCrisis(crisis)).toBe(true);
  });
  it.each(SHIPPED)("%s: leaves an ordinary question alone", (_locale, _crisis, ordinary) => {
    expect(detectCrisis(ordinary)).toBe(false);
  });
  it("also covers Korean self-harm and Chinese 想死, which the store questionnaires name", () => {
    expect(detectCrisis("자해를 하고 싶어요")).toBe(true);
    expect(detectCrisis("我想死")).toBe(true);
  });
});

describe("hotlines for the regions the new languages are spoken in", () => {
  it("Korea, Taiwan and Hong Kong each return a local number rather than the international fallback", () => {
    expect(crisisResources("KR")[0]?.phone).toBe("109");
    expect(crisisResources("TW")[0]?.phone).toBe("1925");
    expect(crisisResources("HK")[0]?.phone).toBe("23892222");
  });
  it("every number is dialable: digits only, no spaces or punctuation the dialer would choke on", () => {
    for (const region of ["KR", "TW", "HK", "IL", "US", "JP", undefined]) for (const r of crisisResources(region)) expect(r.phone, `${region} ${r.name}`).toMatch(/^\d+$/);
  });
  it("an unknown region still gets the international list", () => {
    expect(crisisResources("ZZ")).toEqual(crisisResources(undefined));
  });
});
