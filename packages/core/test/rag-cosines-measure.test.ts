import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Bm25Index } from "../src/rag/bm25";
import { cosineQuantized, normalize, quantize } from "../src/rag/vector";

/**
 * Regenerates `fixtures/rag/cjk-cosines.json` and `docs/qa/fix-cjk-floor/measurements.txt` from a fresh embedding
 * pass, for the day the shipped embedder changes and F327's rule has to be re-argued. Skipped unless asked for:
 *
 *   node docs/qa/fix-cjk-floor/embed.mjs <outDir>
 *   INBORN_MEASURE_VECTORS=<outDir>/vectors.json pnpm --filter @inborn/core exec vitest run test/rag-cosines-measure.test.ts
 */
const VECTORS = process.env.INBORN_MEASURE_VECTORS;
const QA = join(__dirname, "../../../docs/qa/fix-cjk-floor");

interface Doc {
  id: string;
  lang: string;
  source: string;
  text: string;
  on: string[];
  off: string[];
}

describe.skipIf(!VECTORS)("the measured cosines behind F327", () => {
  it("recomputes every question from a fresh embedding pass", () => {
    const docs = (JSON.parse(readFileSync(join(QA, "fixtures.json"), "utf8")) as { docs: Doc[] }).docs;
    const vectors = JSON.parse(readFileSync(VECTORS!, "utf8")) as Record<string, number[]>;
    const at = (key: string): Float32Array => {
      const v = vectors[key];
      expect(v, `no embedding for ${key}`).toBeTruthy();
      return Float32Array.from(v!);
    };
    const lines: string[] = [];
    const out = {
      embedder: "nomic-embed-text-v1.5.f16.gguf",
      prefixes: ["search_document: ", "search_query: "],
      measured: "llama-embedding --pooling mean --embd-normalize 2, then the app's own quantize()/cosineQuantized() (packages/core/src/rag/vector.ts)",
      why: "The relevance floor's cosine half could never be seen by a test that pins the cosine itself (F195/F278 did, which is how F282 survived them). These are the embedder's real numbers for one-passage documents.",
      docs: docs.map((d) => {
        const { q, scale } = quantize(at(`doc:${d.id}`));
        const index = new Bm25Index();
        index.add(d.id, d.text);
        const questions = (["on", "off"] as const).flatMap((kind) =>
          d[kind].map((question) => {
            const cosine = Number(cosineQuantized(q, scale, normalize(at(`q:${d.id}:${kind}:${question}`))).toFixed(4));
            const hit = index.search(question, 5)[0];
            lines.push(`${d.id.padEnd(10)} ${kind.padEnd(3)} cos=${cosine.toFixed(4)} bm25=${String(Number((hit?.score ?? 0).toFixed(3))).padStart(6)} terms=${String(hit?.matched ?? 0).padStart(2)}  ${question}`);
            return { kind, q: question, cosine };
          }),
        );
        return { id: d.id, lang: d.lang, source: d.source, text: d.text, questions };
      }),
    };
    writeFileSync(join(__dirname, "fixtures/rag/cjk-cosines.json"), JSON.stringify(out, null, 1));
    writeFileSync(join(QA, "measurements.txt"), lines.join("\n") + "\n");
    expect(out.docs.flatMap((d) => d.questions).length).toBeGreaterThan(100);
  });
});
