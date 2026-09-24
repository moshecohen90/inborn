/**
 * F327's embedding pass: runs the embedder the app ships over `fixtures.json` with the app's own prefixes and
 * writes the raw vectors, so `packages/core/test/rag-cosines-measure.test.ts` can recompute the table and the
 * committed fixture from them. Needs llama.cpp's `llama-embedding` on PATH.
 *
 *   node docs/qa/fix-cjk-floor/embed.mjs /tmp/measure
 *   INBORN_MEASURE_VECTORS=/tmp/measure/vectors.json pnpm --filter @inborn/core exec vitest run test/rag-cosines-measure.test.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) throw new Error("usage: node embed.mjs <output directory>");
mkdirSync(out, { recursive: true });

const modelsDir = process.env.INBORN_MODELS_DIR ?? join(here, "../../../.models");
const model = join(modelsDir, "nomic-embed-text-v1.5.f16.gguf");
const { docs } = JSON.parse(readFileSync(join(here, "fixtures.json"), "utf8"));

/* The same two prefixes packages/core/src/rag/embedder.ts puts on nomic, or retrieval quality drops and the numbers mean nothing. */
const items = [];
for (const d of docs) {
  items.push({ key: `doc:${d.id}`, line: "search_document: " + d.text });
  for (const kind of ["on", "off"]) for (const q of d[kind]) items.push({ key: `q:${d.id}:${kind}:${q}`, line: "search_query: " + q });
}
writeFileSync(join(out, "prompts.txt"), items.map((i) => i.line).join("\n") + "\n");

const raw = execFileSync("llama-embedding", ["-m", model, "-f", join(out, "prompts.txt"), "--pooling", "mean", "--embd-normalize", "2", "--embd-output-format", "json", "-c", "2048", "-b", "2048", "-ngl", "99", "--no-warmup"], { maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] }).toString();
const parsed = JSON.parse(raw);
if (parsed.data.length !== items.length) throw new Error(`got ${parsed.data.length} embeddings for ${items.length} inputs`);
const vectors = {};
for (const row of parsed.data) vectors[items[row.index].key] = row.embedding;
writeFileSync(join(out, "vectors.json"), JSON.stringify(vectors));
console.log(`embedded ${items.length} texts, dim ${parsed.data[0].embedding.length} → ${join(out, "vectors.json")}`);
