import { describe, expect, it } from "vitest";
import { Bm25Index, bm25Tokens } from "../src/rag";

/** F368. Elided articles and German umlauts typed as ae/oe/ue no longer hide a word from the lexical index. */
const one = (passage: string) => {
  const idx = new Bm25Index();
  idx.add("p", passage);
  return idx;
};
const matched = (passage: string, q: string) => one(passage).search(q)[0]?.matched ?? 0;

describe("F368 · an elided article is glue, the word after it is the word", () => {
  const pairs: Array<[string, string, string, number]> = [
    ["fr", "Une présentation de l'œuvre complète.", "oeuvre", 1],
    ["fr", "Le rapport annuel d’Aoba Trading.", "Aoba", 1],
    ["fr", "Nous sommes d'accord sur le budget.", "accord", 1],
    ["fr", "Jusqu'à l'automne, lorsqu'il pleut.", "automne", 1],
    ["it", "La storia dell'arte e l'architettura nell'antichità.", "arte architettura antichita", 3],
    ["it", "Un'altra volta quest'anno.", "altra anno", 2],
    ["ca", "L'estació d'autobusos s'omple.", "estacio autobusos", 2],
    ["en", "Moshe's report is ready.", "Moshe", 1],
  ];
  for (const [lang, passage, q, n] of pairs)
    it(`${lang}: "${q}" finds "${passage}"`, () => expect([q, matched(passage, q)]).toEqual([q, n]));

  it("the article and the elided glue after it never count as a word", () => {
    for (const w of ["l'", "qu'il", "c'est", "j'ai", "n'est", "s'il", "d'une", "l'on", "jusqu'à", "c'è", "it's"]) expect([w, bm25Tokens(w)]).toEqual([w, []]);
    expect(bm25Tokens("j'ai")).not.toContain("ai");
  });

  it("an apostrophe inside a word that is not an elision keeps the word whole", () => {
    expect(bm25Tokens("aujourd'hui")).toEqual(["aujourd'hui"]);
    expect(bm25Tokens("don't")).toEqual(["don't"]);
    expect(bm25Tokens("O'Brien")).toEqual(["o'brien"]);
    expect(bm25Tokens("prud’homme")).toEqual(["prud’homme"]);
  });

  it("the elided and the bare spelling score a passage exactly alike", () => {
    const idx = new Bm25Index();
    idx.add("a", "Une présentation de l'œuvre complète.");
    idx.add("b", "Cette œuvre est courte.");
    expect(idx.search("l'oeuvre")).toEqual(idx.search("oeuvre"));
    expect(idx.search("oeuvre").map((h) => h.id).sort()).toEqual(["a", "b"]);
  });
});

describe("F368 · German typed with ae/oe/ue finds ä/ö/ü, and the other way round", () => {
  const pairs: Array<[string, string, number]> = [
    ["Die Firma hat Büros in drei Städten.", "Staedten", 1],
    ["Der Sitz liegt in München.", "Muenchen", 1],
    ["Die Straße ist gesperrt.", "Strasse", 1],
    ["Die Größe der Hauptbüros.", "Groesse Hauptbueros", 2],
    ["Er wohnt in Muenchen.", "München", 1],
  ];
  for (const [passage, q, n] of pairs) it(`"${q}" finds "${passage}"`, () => expect([q, matched(passage, q)]).toEqual([q, n]));

  it("a word with legitimate ae/oe/ue is found exactly as it is typed", () => {
    for (const [p, q] of <Array<[string, string]>>[
      ["Die Poesie des Mittelalters.", "Poesie"],
      ["Das Aerosol im Raum.", "Aerosol"],
      ["Die Quelle des Flusses.", "Quelle"],
      ["Das Feuer brennt.", "Feuer"],
      ["Die aktuelle Steuer.", "aktuelle Steuer"],
      ["Michael and Israel met.", "Michael Israel"],
    ])
      expect([q, matched(p, q)]).toEqual([q, q.split(" ").length]);
  });

  it("an umlaut and its digraph count as one word, and score the umlaut passage as the bare fold does", () => {
    expect(matched("Die Städten und Staedten.", "Städten")).toBe(1);
    const idx = new Bm25Index();
    idx.add("a", "Die Firma hat Büros in drei Städten.");
    idx.add("b", "Die Stadt am Fluss.");
    expect(idx.search("Staedten")).toEqual(idx.search("Städten"));
    expect(idx.search("stadten")).toEqual(idx.search("Städten"));
  });

  it("the digraph is never folded to a bare vowel, so ae/oe/ue words do not meet unrelated ones", () => {
    expect(matched("Die Posie.", "Poesie")).toBe(0);
    expect(matched("Das Musum.", "Museum")).toBe(0);
    expect(bm25Tokens("Poesie Quelle Feuer")).toEqual(["poesie", "quelle", "feuer"]);
  });
});
