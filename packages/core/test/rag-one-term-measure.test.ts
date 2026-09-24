import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Bm25Index, bm25Tokens, isCjkFunctionTerm, isWeakTerm } from "../src/rag/bm25";
import { relevanceDoors } from "../src/rag/prompt";
import { cosineQuantized, normalize, quantize } from "../src/rag/vector";
import shipped from "./fixtures/rag/e5-cosines.json";

/**
 * F365. Every question that shares exactly one term with a passage, on round 70's two sets (e5-cosines.json) and on
 * the year/number set of this round (docs/qa/fix-corroboration-door/one-term-set.json), with the shipped embedder's
 * cosine and the BM25 score: the numbers e5's one-word corroboration door is set from. Writes the committed
 * `fixtures/rag/one-term-e5.json` and `docs/qa/fix-corroboration-door/one-term.md`.
 *
 *   node docs/qa/fix-corroboration-door/embed-one-term.mjs /tmp/one-term
 *   INBORN_MEASURE_ONE_TERM=/tmp/one-term pnpm --filter @inborn/core exec vitest run test/rag-one-term-measure.test.ts
 */
const QA = join(__dirname, "../../../docs/qa/fix-corroboration-door");
const DIR = process.env.INBORN_MEASURE_ONE_TERM;

interface SetDoc {
  id: string;
  lang: string;
  text: string;
  on: string[];
  off: string[];
}
export interface Row {
  set: string;
  doc: string;
  lang: string;
  kind: "on" | "off";
  chunk: number;
  answering: boolean;
  q: string;
  cos: number;
  bm25: number;
  /** Shared non-glue terms, weak ones included: what the round-70 rule counted. */
  shared: string[];
  weak: string[];
}

/** One row per (question, chunk): the lexical side scored by the real index. */
export function rowsFor(set: string, doc: string, lang: string, kind: "on" | "off", q: string, chunks: string[], cosines: number[], answers: number): Row[] {
  const index = new Bm25Index();
  chunks.forEach((c, i) => index.add(String(i), c));
  const lexical = new Map(index.search(q, 10).map((h) => [h.id, h]));
  const asked = new Set(bm25Tokens(q));
  return chunks.map((c, i) => {
    const shared = [...new Set(bm25Tokens(c))].filter((t) => asked.has(t) && !isCjkFunctionTerm(t));
    return { set, doc, lang, kind, chunk: i, answering: kind === "on" && i === answers, q, cos: cosines[i]!, bm25: Number((lexical.get(String(i))?.score ?? 0).toFixed(3)), shared, weak: shared.filter(isWeakTerm) };
  });
}

describe.skipIf(!DIR)("F365 · measures the one-term questions under e5", () => {
  it("writes the committed cosines and the table", () => {
    const vectors = JSON.parse(readFileSync(join(DIR!, "vectors.json"), "utf8")) as Record<string, number[]>;
    const f32 = (key: string) => {
      const v = vectors[key];
      if (!v) throw new Error(`no vector for ${key}`);
      return Float32Array.from(v);
    };
    const set = JSON.parse(readFileSync(join(QA, "one-term-set.json"), "utf8")).docs as SetDoc[];
    const docs = set.map((d) => {
      const { q, scale } = quantize(f32(`doc:${d.id}`));
      const questions = (["on", "off"] as const).flatMap((kind) => d[kind].map((question) => ({ kind, q: question, cosine: Number(cosineQuantized(q, scale, normalize(f32(`q:${d.id}:${kind}:${question}`))).toFixed(4)) })));
      return { id: d.id, lang: d.lang, text: d.text, questions };
    });
    writeFileSync(
      join(__dirname, "fixtures/rag/one-term-e5.json"),
      `${JSON.stringify({ embedder: shipped.embedder, prefixes: shipped.prefixes, measured: shipped.measured, why: "F365: year/number questions in every launch script, measured with the shipped embedder, so e5's one-word door is guarded on real cosines.", docs }, null, 1)}\n`,
    );

    const rows: Row[] = [
      ...(shipped.docs as Array<{ id: string; lang: string; text: string; questions: Array<{ kind: "on" | "off"; q: string; cosine: number }> }>).flatMap((d) => d.questions.flatMap((q) => rowsFor("r70-one", d.id, d.lang, q.kind, q.q, [d.text], [q.cosine], 0))),
      ...(shipped.multi as Array<{ id: string; lang: string; answers: number; chunks: string[]; questions: Array<{ kind: "on" | "off"; q: string; cosines: number[] }> }>).flatMap((d) => d.questions.flatMap((q) => rowsFor("r70-six", d.id, d.lang, q.kind, q.q, d.chunks, q.cosines, d.answers))),
      ...docs.flatMap((d) => d.questions.flatMap((q) => rowsFor("r83-years", d.id, d.lang, q.kind, q.q, [d.text], [q.cosine], 0))),
    ];
    const one = rows.filter((r) => r.shared.length === 1);
    const door = relevanceDoors("embed-e5");
    const off = rows.filter((r) => r.kind === "off").map((r) => r.cos);
    const offOne = one.filter((r) => r.kind === "off");
    const onOneBelowAlone = one.filter((r) => r.kind === "on" && r.cos <= door.alone && r.weak.length === 0);
    const topOffOne = Math.max(...offOne.map((r) => r.cos));
    const kept = onOneBelowAlone.filter((r) => r.cos >= door.corroborate).map((r) => r.cos);
    const lost = onOneBelowAlone.filter((r) => r.cos < door.corroborate);
    const line = (r: Row) =>
      `| ${r.set} | ${r.doc}#${r.chunk} | ${r.kind}${r.kind === "on" ? (r.answering ? "" : " (other chunk)") : ""} | ${r.q} | ${r.shared.join(", ")}${r.weak.length ? " (weak)" : ""} | ${r.cos.toFixed(4)} | ${r.bm25.toFixed(2)} | ${r.cos > door.alone ? "cosine alone" : r.weak.length ? "0 terms: refused" : r.cos >= door.corroborate || r.bm25 >= door.minBm25 ? "kept" : "refused"} |`;
    const md = [
      "# F365 · one shared term under e5",
      "",
      "Every (question, chunk) pair that shares exactly one non-glue term, with the shipped embedder's quantized cosine and the real BM25 score.",
      "Sets: round 70's one-passage and six-chunk documents (`packages/core/test/fixtures/rag/e5-cosines.json`) and this round's year/number set (`one-term-set.json`, cosines in `fixtures/rag/one-term-e5.json`).",
      "Regenerate: see the header of `packages/core/test/rag-one-term-measure.test.ts`.",
      "",
      `Doors for \`embed-e5\` (packages/core/src/rag/prompt.ts RELEVANCE_DOORS): alone > ${door.alone}, one content word needs cosine >= ${door.corroborate} or BM25 >= ${door.minBm25}. A weak term (number, year, unit, numeral bigram, lone CJK character) counts only beside a content word.`,
      "",
      "## Margins",
      "",
      `- Off-topic pairs, any term count: ${off.length}, highest cosine ${Math.max(...off).toFixed(4)} (the alone door's margin is ${(door.alone - Math.max(...off)).toFixed(4)}).`,
      `- Off-topic pairs sharing one term: ${offOne.length}, highest cosine ${topOffOne.toFixed(4)} (${offOne.find((r) => r.cos === topOffOne)!.shared.join(", ")}); the corroboration door sits ${(door.corroborate - topOffOne).toFixed(4)} above it even before the weak-term rule.`,
      `- On-topic pairs sharing one content word, at or under the alone door: ${onOneBelowAlone.length}; the door keeps ${kept.length} (lowest kept ${Math.min(...kept).toFixed(4)}, margin ${(Math.min(...kept) - door.corroborate).toFixed(4)}) and refuses ${lost.length}: ${lost.map((r) => `${r.doc}#${r.chunk} ${r.answering ? "answering" : "other chunk"} ${r.cos.toFixed(4)}`).join("; ")}.`,
      "",
      "## Every one-term pair",
      "",
      "| set | chunk | kind | question | shared term | cosine | BM25 | e5 verdict |",
      "|---|---|---|---|---|---|---|---|",
      ...one.sort((a, b) => a.kind.localeCompare(b.kind) || b.cos - a.cos).map(line),
      "",
    ].join("\n");
    writeFileSync(join(QA, "one-term.md"), md);
    expect(one.length).toBeGreaterThan(0);
  });
});
