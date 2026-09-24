import { describe, expect, it } from "vitest";
import { Bm25Index, VectorIndex, cosine, dequantize, hashVector, mmr, normalize, quantize, reciprocalRankFusion, termsOf, bm25Tokens } from "../src/index";

describe("BM25", () => {
  it("ranks the chunk that repeats the query terms first and reports matched terms", () => {
    const idx = new Bm25Index();
    idx.add("a", "The warranty covers the battery for two years.");
    idx.add("b", "Shipping is free above fifty dollars.");
    idx.add("c", "Battery warranty: battery replacement within the warranty period.");
    const hits = idx.search("the battery warranty");
    expect(hits[0]!.id).toBe("c");
    expect(hits[0]!.matched).toBe(2);
    expect(hits.map((h) => h.id)).not.toContain("b");
  });

  it("matches Hebrew words through prefixes and ignores nikud", () => {
    expect(termsOf("והאחריות")).toEqual(["והאחריות", "אחריות"]);
    expect(termsOf("של")).toEqual(["של"]);
    const idx = new Bm25Index();
    idx.add("a", "תנאי האחריות חלים על כל מוצר.");
    idx.add("b", "משלוח חינם מעל חמישים שקלים.");
    expect(idx.search("אחריות")[0]!.id).toBe("a");
    expect(bm25Tokens("הָאַחֲרָיוּת")).toContain("אחריות");
  });

  it("F363: 'que' is glue in French, Spanish and Portuguese, so an off-topic question does not match a passage on it", () => {
    for (const [passage, question] of [
      ["La maison a été fondée en 1962 et ne traitait alors que du bois importé.", "Mon enfant a de la fièvre, que faire?"],
      ["La empresa dice que sus oficinas están en Sendai.", "¿Hay que calentar antes de correr?"],
      ["O relatório diz que a empresa emprega trezentas pessoas.", "O que eu faço com a febre do meu filho?"],
    ] as const) {
      const idx = new Bm25Index();
      idx.add("p", passage);
      expect([question, idx.search(question)[0]?.matched ?? 0]).toEqual([question, 0]);
    }
    expect(bm25Tokens("Qu'est-ce que la société fabrique?")).toContain("société");
  });

  it("removes and re-adds documents", () => {
    const idx = new Bm25Index();
    idx.add("a", "alpha beta");
    idx.remove("a");
    expect(idx.size).toBe(0);
    expect(idx.search("alpha")).toEqual([]);
  });
});

describe("int8 vectors", () => {
  it("quantizes to within 1% cosine of the float vector", () => {
    const v = new Float32Array(768).map(() => Math.random() - 0.5);
    const { q, scale } = quantize(v);
    expect(cosine(dequantize(q, scale), v)).toBeGreaterThan(0.99);
  });

  it("returns nearest neighbours in cosine order and honours the document filter", () => {
    const idx = new VectorIndex();
    const base = hashVector("battery warranty period two years", 64);
    idx.add("c1", "doc1", base);
    idx.add("c2", "doc1", hashVector("free shipping above fifty dollars", 64));
    idx.add("c3", "doc2", hashVector("warranty covers the battery", 64));
    const hits = idx.search(hashVector("battery warranty", 64), 3);
    expect(hits.map((h) => h.id).slice(0, 2).sort()).toEqual(["c1", "c3"]);
    expect(hits[0]!.score).toBeGreaterThan(hits[2]!.score);
    expect(idx.search(hashVector("battery warranty", 64), 3, (d) => d === "doc2").map((h) => h.id)).toEqual(["c3"]);
  });

  it("rejects a mismatched dimension", () => {
    const idx = new VectorIndex();
    idx.add("c1", "d", new Float32Array(8));
    expect(() => idx.add("c2", "d", new Float32Array(9))).toThrow(/dimension/);
    expect(normalize(new Float32Array(3)).every((x) => x === 0)).toBe(true);
  });
});

describe("fusion", () => {
  it("RRF favours ids present in both lists", () => {
    const fused = reciprocalRankFusion([
      [{ id: "x", score: 9 }, { id: "y", score: 8 }],
      [{ id: "y", score: 3 }, { id: "z", score: 2 }],
    ]);
    expect(fused[0]!.id).toBe("y");
    expect(fused.map((f) => f.id)).toEqual(["y", "x", "z"]);
  });

  it("MMR picks a diverse second result over a near-duplicate", () => {
    const a = hashVector("battery warranty two years", 64);
    const dup = hashVector("battery warranty two years!", 64);
    const other = hashVector("shipping cost and delivery time", 64);
    const picked = mmr(
      [
        { id: "a", relevance: 1, vector: a },
        { id: "dup", relevance: 0.98, vector: dup },
        { id: "other", relevance: 0.6, vector: other },
      ],
      2,
      0.5,
    );
    expect(picked.map((p) => p.id)).toEqual(["a", "other"]);
  });
});
