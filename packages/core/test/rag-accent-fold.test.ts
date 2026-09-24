import { describe, expect, it } from "vitest";
import { Bm25Index, bm25Tokens } from "../src/rag";

/** F367. A word typed without its accents meets its accented form in the lexical index, on both sides. */
const one = (passage: string) => {
  const idx = new Bm25Index();
  idx.add("p", passage);
  return idx;
};

describe("F367 · accent-less typing matches accented text", () => {
  /* Each question shares only its accent-less words with the passage, so every match counted is a folded one. */
  const pairs: Array<[string, string, string, number]> = [
    ["fr", "La salle compte deux cents sièges et une scène.", "sieges scene", 2],
    ["es", "La canción ganó el premio en Bogotá.", "cancion gano bogota", 3],
    ["pt", "A informação e a publicação chegaram.", "informacao publicacao", 2],
    ["de", "Die Größe der Halle an der Straße beträgt 300 Quadratmeter.", "grosse strasse betragt", 3],
    ["fr", "Le garçon a mangé une crème brûlée.", "garcon mange creme brulee", 4],
    ["fr", "Une œuvre classée ex æquo.", "oeuvre aequo", 2],
  ];
  for (const [lang, passage, sloppy, n] of pairs)
    it(`${lang}: "${sloppy}" finds its accented passage on every word`, () => {
      expect([sloppy, one(passage).search(sloppy)[0]?.matched ?? 0]).toEqual([sloppy, n]);
    });

  it("an accented and an accent-less query score the same passage exactly the same, so a folded match never outranks an exact one", () => {
    const idx = new Bm25Index();
    idx.add("a", "La salle compte deux cents sièges.");
    idx.add("b", "Les sieges du conseil sont vacants.");
    idx.add("c", "Une scène sans public.");
    const exact = idx.search("sièges");
    const sloppy = idx.search("sieges");
    expect(sloppy).toEqual(exact);
    expect(exact.map((h) => h.id).sort()).toEqual(["a", "b"]);
  });

  it("glue stays glue with or without its accent, and a stop word's accent-less twin that is a content word elsewhere is kept", () => {
    for (const w of ["que", "qué", "está", "esta", "más", "où", "für", "über", "très", "também", "você", "können"]) expect([w, bm25Tokens(w)]).toEqual([w, []]);
    /* es "tres" (three), en "fur" and "uber", en "meme" are content words; only their accented spellings are glue. */
    for (const w of ["tres", "fur", "uber", "meme"]) expect(bm25Tokens(w)).toEqual([w]);
  });

  it("scripts whose marks are letters are left as they are: kana voicing, Hangul, Cyrillic й, Hebrew, Arabic", () => {
    expect(bm25Tokens("ビジネスが")).toContain("スが");
    expect(bm25Tokens("ガス")).toEqual(["ガス"]);
    expect(bm25Tokens("한국어 문서")).toEqual(["한국어", "문서"]);
    expect(bm25Tokens("мой")).toEqual(["мой"]);
    expect(bm25Tokens("ёлка")).toEqual(["ёлка"]);
    expect(bm25Tokens("הַבַּיִת")).toContain("בית");
    expect(bm25Tokens("المدرسة")).toContain("مدرسة");
  });

  it("the letters NFD does not split are spelled out: ß, æ, œ, ø, ł", () => {
    expect(bm25Tokens("Straße Æther cœur Søren Łódź")).toEqual(["strasse", "aether", "coeur", "soren", "lodz"]);
  });
});
