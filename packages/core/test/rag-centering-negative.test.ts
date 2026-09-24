import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Bm25Index } from "../src/rag/bm25";
import { isRelevant, relevanceDoors } from "../src/rag/prompt";
import { hasCjk } from "../src/rag/text";
import { cosineQuantized, normalize, quantize } from "../src/rag/vector";
import centering from "./fixtures/rag/centering.json";
import shipped from "./fixtures/rag/e5-cosines.json";

/**
 * F330. Round 70 closed the cosine-only door and cost 28 of 57 on-topic questions their citation, so round 70b was
 * asked to win them back by giving the cosine a topic signal: centre it against a per-script bank of neutral
 * sentences, or against the document's own chunk distribution. Neither works, and this file is why nobody should
 * spend the round again: the numbers are committed, the thresholds are swept here, and the bar is asserted unmet.
 * Every number in the first two blocks is nomic-embed-text-v1.5, the English embedder shipped until round 72; the
 * last block asserts the multilingual embedder that replaced it clears the same bar on the same questions (F334).
 *
 * Regenerating (needs llama.cpp's `llama-embedding` and the shipped embedder):
 *   node docs/qa/fix-cjk-floor/embed.mjs /tmp/measure && node docs/qa/fix-cjk-floor/embed-centering.mjs /tmp/measure
 *   INBORN_MEASURE_VECTORS=/tmp/measure/vectors.json INBORN_MEASURE_CENTERING=/tmp/measure/centering-vectors.json \
 *     pnpm --filter @inborn/core exec vitest run test/rag-centering-negative.test.ts
 */
const QA = join(__dirname, "../../../docs/qa/fix-cjk-floor");
const FRESH = process.env.INBORN_MEASURE_CENTERING;
/* The one-passage vectors come from round 70's own pass; neither set is committed, only the numbers they produce. */
const FRESH_SINGLE = process.env.INBORN_MEASURE_VECTORS;

interface Scored {
  doc: string;
  lang: string;
  kind: "on" | "off";
  q: string;
  /** Distinct content terms the question shares with the passage, by the real lexical index. */
  terms: number;
  bm25: number;
  cos: number;
  /** cos minus the mean cosine of the question against its script's null bank. */
  centred: number;
  /** The same, divided by that bank's spread. */
  z: number;
}
interface MultiChunk {
  doc: string;
  lang: string;
  kind: "on" | "off";
  q: string;
  /** Index of the one chunk that answers the question. */
  answer: number;
  /** Index of the chunk the embedder ranks first. */
  top: number;
  per: Array<{ cos: number; bm25: number; terms: number }>;
}

const single = centering.single as Scored[];
const multi = centering.multi as MultiChunk[];

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

/** Best a "round-70 rule OR centred score >= T" door can do: sweep T, keep only thresholds that cite no off-topic question. */
function sweep(rows: Scored[], metric: "cos" | "centred" | "z"): { kept: number; total: number; T: number; margin: number } {
  const zero = rows.filter((r) => r.terms === 0);
  const on = zero.filter((r) => r.kind === "on").map((r) => r[metric]);
  const off = zero.filter((r) => r.kind === "off").map((r) => r[metric]);
  const T = Math.max(...off);
  const above = on.filter((v) => v > T);
  return { kept: above.length, total: on.length, T, margin: above.length ? Math.min(...above) - T : 0 };
}

describe("F330 · on the old embedder, centring the cosine does not win the recall back", () => {
  it("the raw cosine keeps nothing once every off-topic question must be dropped", () => {
    const s = sweep(single, "cos");
    expect(s.total).toBe(44);
    expect(s.kept).toBe(0);
  });

  it("centring against the script's null bank keeps almost nothing, and z-scoring keeps nothing of 44", () => {
    expect(sweep(single, "centred").kept).toBeLessThanOrEqual(1);
    /* Round 70b's 6 of 28 did not survive F363's accented and zh-Hant questions: one more off-topic question closed the gap. */
    expect(sweep(single, "z").kept).toBe(0);
  });

  it("no door reaches the bar: 73 of 83 on-topic with nothing off-topic cited", () => {
    const lexical = single.filter((r) => r.kind === "on" && isRelevant({ chunk: { id: "c", docId: "d", page: 1, ord: 0, text: "t", start: 0, end: 1, tokens: 1 }, score: 1, cosine: r.cos, bm25: r.bm25, bm25Terms: r.terms }, relevanceDoors("embed-nomic"))).length;
    const best = Math.max(...(["cos", "centred", "z"] as const).map((m) => sweep(single, m).kept));
    expect(lexical + best).toBeLessThan(73);
    expect(lexical + best).toBe(39);
  });
});

/**
 * The reason, and the part that settles it: on a six-chunk document the embedder does not rank the answering chunk
 * first for these questions at all, so handing them back to the cosine would cite the wrong passage, not the right
 * one. Round 69 looked better only because its floor let every chunk through.
 */
describe("F330 · the old embedder is not finding the right chunk either", () => {
  const on = multi.filter((r) => r.kind === "on");

  it("the answering chunk is ranked first for 3 of 27 on-topic questions", () => {
    expect(on.length).toBe(27);
    expect(on.filter((r) => r.top === r.answer).length).toBe(3);
  });

  it("German and French ask about the headcount and get the turnover chunk", () => {
    for (const lang of ["de", "fr"]) expect(on.filter((r) => r.lang === lang && r.top === r.answer).length).toBe(0);
  });

  it("neither top-minus-median nor the within-document z separates on-topic from off-topic", () => {
    const score = (r: MultiChunk, kind: "gap" | "z") => {
      const cs = r.per.map((p) => p.cos);
      const best = Math.max(...cs);
      return kind === "gap" ? best - median(cs) : (best - mean(cs)) / (sd(cs) || 1);
    };
    for (const kind of ["gap", "z"] as const) {
      const zero = multi.filter((r) => r.per[r.top]!.terms === 0);
      const worstOff = Math.max(...zero.filter((r) => r.kind === "off").map((r) => score(r, kind)));
      const keptOn = zero.filter((r) => r.kind === "on" && score(r, kind) > worstOff).length;
      expect([kind, keptOn]).toEqual([kind, 0]);
    }
  });

  it("round 69's apparent recall was the whole document going into the prompt", () => {
    const old = (h: { cos: number; bm25: number; terms: number }) => h.cos >= 0.5 || h.terms >= 2 || (h.terms >= 1 && h.bm25 >= 2.0);
    const fenced = multi.map((r) => r.per.filter(old).length);
    expect(mean(fenced)).toBeGreaterThan(5);
    /* §10.4 #30: never the whole file into the prompt. */
    expect(fenced.filter((n) => n === 6).length).toBeGreaterThan(multi.length / 2);
  });
});

/** F334: what round 70b could not buy with any door, the multilingual embedder gets with the plainest one. */
describe("F334 · the bar is met by the embedder, not by a door", () => {
  const e5One = shipped.docs as Array<{ id: string; lang: string; text: string; questions: Array<{ kind: "on" | "off"; q: string; cosine: number }> }>;
  const e5Six = shipped.multi as Array<{ answers: number; questions: Array<{ kind: "on" | "off"; cosines: number[] }> }>;
  const hit = (cosine: number, bm25: number, bm25Terms: number) => ({ chunk: { id: "c", docId: "d", page: 1, ord: 0, text: "t", start: 0, end: 1, tokens: 1 }, score: 1, cosine, bm25, bm25Terms });
  const scored = e5One.flatMap((d) => {
    const idx = new Bm25Index();
    idx.add(d.id, d.text);
    return d.questions.map((q) => ({ kind: q.kind, ok: isRelevant(hit(q.cosine, idx.search(q.q, 5)[0]?.score ?? 0, idx.search(q.q, 5)[0]?.matched ?? 0)) }));
  });

  it("answering chunk first: the old embedder 3 of 27, the shipped one 25 of 27", () => {
    expect(multi.filter((r) => r.kind === "on" && r.top === r.answer).length).toBe(3);
    const on = e5Six.flatMap((d) => d.questions.filter((q) => q.kind === "on").map((q) => q.cosines.indexOf(Math.max(...q.cosines)) === d.answers));
    expect(on.filter(Boolean).length).toBe(25);
  });

  it("one-passage recall with nothing off-topic cited: the old embedder's best door 39 of 83, the shipped one 74 of 83", () => {
    expect(scored.filter((r) => r.kind === "on" && r.ok).length).toBeGreaterThanOrEqual(73);
    /* 75 until F365 raised e5's one-word corroboration door to 0.815; "Which cities host the offices?" sits under it. */
    expect(scored.filter((r) => r.kind === "on" && r.ok).length).toBe(74);
    expect(scored.filter((r) => r.kind === "off" && r.ok).length).toBe(0);
  });
});

describe.skipIf(!FRESH || !FRESH_SINGLE)("regenerates the committed numbers from a fresh embedding pass", () => {
  it("recomputes both halves", () => {
    const vectors = JSON.parse(readFileSync(FRESH!, "utf8")) as Record<string, number[]>;
    const fixtures = JSON.parse(readFileSync(join(QA, "fixtures.json"), "utf8")).docs as Array<{ id: string; lang: string; text: string; on: string[]; off: string[] }>;
    const singleVectors = JSON.parse(readFileSync(FRESH_SINGLE!, "utf8")) as Record<string, number[]>;
    const banks = JSON.parse(readFileSync(join(QA, "nullbank.json"), "utf8")).banks as Record<string, string[]>;
    const mc = JSON.parse(readFileSync(join(QA, "multichunk.json"), "utf8")).docs as Array<{ id: string; lang: string; chunks: string[]; answers: number; on: string[]; off: string[] }>;
    const f32 = (v: number[] | undefined, key: string) => { if (!v) throw new Error(`no embedding for ${key}`); return Float32Array.from(v); };
    const LATIN = ["en", "de", "es", "fr", "pt"];
    const bankQuant: Record<string, Array<{ q: Int8Array; scale: number }>> = {};
    for (const lang of Object.keys(banks)) bankQuant[lang] = banks[lang]!.map((_, i) => quantize(f32(vectors[`bank:${lang}:${i}`], `bank:${lang}:${i}`)));
    const scriptBank: Record<string, Array<{ q: Int8Array; scale: number }>> = { ja: bankQuant.ja!, zh: bankQuant.zh!, ko: bankQuant.ko!, he: bankQuant.he!, latin: LATIN.flatMap((l) => bankQuant[l]!) };
    const scriptOf = (t: string) => (hasCjk(t) ? (/[぀-ヿ]/u.test(t) ? "ja" : "zh") : /[א-ת]/u.test(t) ? "he" : /[가-힯]/u.test(t) ? "ko" : "latin");

    const lines: string[] = [];
    const out = { single: [] as Scored[], multi: [] as MultiChunk[] };
    for (const d of fixtures) {
      const { q, scale } = quantize(f32(singleVectors[`doc:${d.id}`], `doc:${d.id}`));
      const idx = new Bm25Index();
      idx.add(d.id, d.text);
      const bank = scriptBank[scriptOf(d.text)]!;
      for (const kind of ["on", "off"] as const)
        for (const question of d[kind]) {
          const qv = normalize(f32(singleVectors[`q:${d.id}:${kind}:${question}`], `q:${d.id}:${kind}:${question}`));
          const cos = cosineQuantized(q, scale, qv);
          const against = bank.map((b) => cosineQuantized(b.q, b.scale, qv));
          const hit = idx.search(question, 5)[0];
          const row: Scored = { doc: d.id, lang: d.lang, kind, q: question, terms: hit?.matched ?? 0, bm25: Number((hit?.score ?? 0).toFixed(3)), cos: Number(cos.toFixed(4)), centred: Number((cos - mean(against)).toFixed(4)), z: Number(((cos - mean(against)) / (sd(against) || 1)).toFixed(3)) };
          out.single.push(row);
          lines.push(`${row.doc.padEnd(10)} ${kind.padEnd(3)} cos=${row.cos.toFixed(4)} centred=${row.centred.toFixed(4)} z=${String(row.z).padStart(7)} terms=${String(row.terms).padStart(2)}  ${question}`);
        }
    }
    for (const d of mc) {
      const chunks = d.chunks.map((c, i) => ({ i, text: c, ...quantize(f32(vectors[`c:${d.id}:${i}`], `c:${d.id}:${i}`)) }));
      const idx = new Bm25Index();
      for (const c of chunks) idx.add(String(c.i), c.text);
      for (const kind of ["on", "off"] as const)
        for (const question of d[kind]) {
          const qv = normalize(f32(vectors[`q:${d.id}:${kind}:${question}`], `q:${d.id}:${kind}:${question}`));
          const lex = new Map(idx.search(question, 10).map((h) => [h.id, h]));
          const per = chunks.map((c) => { const h = lex.get(String(c.i)); return { cos: Number(cosineQuantized(c.q, c.scale, qv).toFixed(4)), bm25: Number((h?.score ?? 0).toFixed(3)), terms: h?.matched ?? 0 }; });
          const top = per.reduce((bestAt, p, i) => (p.cos > per[bestAt]!.cos ? i : bestAt), 0);
          out.multi.push({ doc: d.id, lang: d.lang, kind, q: question, answer: d.answers, top, per });
          lines.push(`${d.id.padEnd(10)} ${kind.padEnd(3)} top=chunk${top} answer=chunk${d.answers} cos=${per[top]!.cos.toFixed(4)} terms=${per[top]!.terms}  ${question}`);
        }
    }
    writeFileSync(join(__dirname, "fixtures/rag/centering.json"), JSON.stringify(out, null, 1));
    writeFileSync(join(QA, "centering-measurements.txt"), lines.join("\n") + "\n");
    expect(existsSync(join(QA, "centering-measurements.txt"))).toBe(true);
  });
});
