import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bm25Tokens } from "../src/rag/bm25";
import { chunkFor, chunkPage } from "../src/rag/chunker";
import { E5_QUERY_PREFIX } from "../src/rag/embedder";
import { LEXICAL_INDEX_ID, lexicalEmbedder } from "../src/rag/overview";
import { isRelevant, relevanceDoors } from "../src/rag/prompt";
import { Retriever } from "../src/rag/retriever";
import { MemoryEmbeddingStore } from "../src/rag/store";
import type { Chunk, DocumentRecord, Embedder } from "../src/rag/types";

/**
 * Round 134L. Every question of docs/qa/r134l-lexical-door/questions.json through the shipped retriever over its
 * fixture, with the e5 index (llama.cpp `llama-embedding`) and words-only, and which hits the door keeps. Run once on
 * the old door with label "before" and once on the new one with "after"; the second run writes the table to
 * docs/qa/r134l-lexical-door/table.md.
 *
 *   INBORN_MEASURE_LEXICAL_DOOR=/tmp/r134l INBORN_MEASURE_LABEL=before pnpm --filter @inborn/core exec vitest run test/rag-lexical-door-measure.test.ts
 */
const ROOT = join(__dirname, "../../..");
const QA = join(ROOT, "docs/qa/r134l-lexical-door");
const DIR = process.env.INBORN_MEASURE_LEXICAL_DOOR;
const LABEL = process.env.INBORN_MEASURE_LABEL ?? "after";

interface Fixture {
  id: string;
  file: string;
  on: string[];
  off: string[];
}
interface HitRow {
  page: number;
  ord: number;
  cos: number;
  terms: number;
  bm25: number;
  /** The question's index terms the passage also holds. */
  shared: string[];
  kept: boolean;
}
interface Row {
  fixture: string;
  mode: "e5" | "words";
  kind: "on" | "off";
  q: string;
  hits: HitRow[];
}

function pagesOf(file: string): string[] {
  const path = join(ROOT, file);
  if (!file.endsWith(".pdf")) return [readFileSync(path, "utf8")];
  const count = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [path]).toString())![1]);
  return Array.from({ length: count }, (_, i) => execFileSync("pdftotext", ["-f", String(i + 1), "-l", String(i + 1), path, "-"]).toString());
}

function embed(texts: string[]): Float32Array[] {
  const model = join(process.env.INBORN_MODELS_DIR ?? join(ROOT, ".models"), "multilingual-e5-large-instruct-Q6_K.gguf");
  const SEP = "<#sep#>";
  const prompts = join(DIR!, "prompts.txt");
  writeFileSync(prompts, texts.join(SEP));
  const raw = execFileSync("llama-embedding", ["-m", model, "-f", prompts, "--embd-separator", SEP, "--pooling", "mean", "--embd-normalize", "2", "--embd-output-format", "json", "-c", "2048", "-b", "2048", "-ngl", "99", "--no-warmup"], { maxBuffer: 1 << 29, stdio: ["ignore", "pipe", "ignore"] }).toString();
  const data = (JSON.parse(raw) as { data: Array<{ index: number; embedding: number[] }> }).data;
  if (data.length !== texts.length) throw new Error(`got ${data.length} embeddings for ${texts.length} texts`);
  const out: Float32Array[] = [];
  for (const row of data) out[row.index] = Float32Array.from(row.embedding);
  return out;
}

const cell = (hits: HitRow[]): string => {
  const kept = hits.filter((h) => h.kept);
  return kept.length ? `${kept.length} (${kept.map((h) => `p${h.page} ${h.shared.join("+")} t${h.terms} ${h.bm25.toFixed(2)}${h.cos ? ` c${h.cos.toFixed(3)}` : ""}`).join(", ")})` : "0";
};

describe.skipIf(!DIR)("r134l lexical door measurement", () => {
  it("runs every question over every fixture, e5 and words-only", async () => {
    mkdirSync(DIR!, { recursive: true });
    const { fixtures } = JSON.parse(readFileSync(join(QA, "questions.json"), "utf8")) as { fixtures: Fixture[] };
    const rows: Row[] = [];
    for (const f of fixtures) {
      const chunks: Chunk[] = [];
      pagesOf(f.file).forEach((text, p) => {
        for (const c of chunkPage(text, chunkFor(512)).chunks) chunks.push({ id: `${f.id}:${chunks.length}`, docId: f.id, page: p + 1, ord: chunks.length, text: c.text, start: c.start, end: c.end, tokens: c.tokens });
      });
      writeFileSync(join(DIR!, `chunks-${f.id}.json`), JSON.stringify(chunks.map((c) => ({ page: c.page, text: c.text }))));
      const questions = [...f.on.map((q) => ({ q, kind: "on" as const })), ...f.off.map((q) => ({ q, kind: "off" as const }))];
      const vectors = embed([...chunks.map((c) => c.text), ...questions.map((x) => E5_QUERY_PREFIX + x.q)]);
      const queryOf = new Map(questions.map((x, i) => [E5_QUERY_PREFIX + x.q, vectors[chunks.length + i]!]));
      const doc: DocumentRecord = { id: f.id, name: f.file.split("/").pop()!, kind: "pdf", bytes: 1, pages: 9, addedAt: 0, status: "indexed", indexedPages: 9, chunkCount: chunks.length, flaggedLines: 0, ocrPages: 0, uri: "x" };
      const e5Store = new MemoryEmbeddingStore();
      await e5Store.putDocument(doc);
      await e5Store.putChunks(chunks, vectors.slice(0, chunks.length));
      const wordStore = new MemoryEmbeddingStore();
      await wordStore.putDocument(doc);
      await wordStore.putChunks(chunks, []);
      const e5: Embedder = { id: "embed-e5", embed: async (texts) => texts.map((t) => queryOf.get(t)!) };
      for (const [mode, retriever, doors] of [
        ["e5", new Retriever(e5Store, e5), relevanceDoors("embed-e5")],
        ["words", new Retriever(wordStore, lexicalEmbedder), relevanceDoors(LEXICAL_INDEX_ID)],
      ] as const) {
        for (const { q, kind } of questions) {
          const hits = await retriever.retrieve(q, { docIds: [f.id] });
          rows.push({ fixture: f.id, mode, kind, q, hits: hits.map((h) => ({ page: h.chunk.page, ord: h.chunk.ord, cos: h.cosine, terms: h.bm25Terms, bm25: h.bm25, shared: [...new Set(bm25Tokens(q))].filter((t) => bm25Tokens(h.chunk.text).includes(t)), kept: isRelevant(h, doors) })) });
        }
      }
    }
    writeFileSync(join(DIR!, `${LABEL}.json`), JSON.stringify(rows, null, 1));
    expect(rows.length).toBeGreaterThan(0);

    const beforePath = join(DIR!, "before.json");
    if (LABEL !== "after" || !existsSync(beforePath)) return;
    const before = JSON.parse(readFileSync(beforePath, "utf8")) as Row[];
    const lines = ["| fixture | index | kind | question | kept before | kept after |", "|---|---|---|---|---|---|"];
    const totals = new Map<string, { n: number; before: number; after: number }>();
    rows.forEach((r, i) => {
      const b = before[i]!;
      lines.push(`| ${r.fixture} | ${r.mode} | ${r.kind} | ${r.q} | ${cell(b.hits)} | ${cell(r.hits)} |`);
      const key = `${r.fixture} ${r.mode} ${r.kind}`;
      const t = totals.get(key) ?? { n: 0, before: 0, after: 0 };
      t.n++;
      if (b.hits.some((h) => h.kept)) t.before++;
      if (r.hits.some((h) => h.kept)) t.after++;
      totals.set(key, t);
    });
    const summary = ["| fixture | index | kind | questions | with a kept passage, before | after |", "|---|---|---|---|---|---|", ...[...totals].map(([k, t]) => `| ${k.split(" ").join(" | ")} | ${t.n} | ${t.before} | ${t.after} |`)];
    writeFileSync(join(QA, "table.md"), `# Round 134L · kept passages before and after the lexical door\n\nCell: kept count (page, shared terms tN, BM25, cosine cN when the vector side ranked the hit). Generated by \`packages/core/test/rag-lexical-door-measure.test.ts\`.\n\n${summary.join("\n")}\n\n${lines.join("\n")}\n`);
  }, 600_000);
});
