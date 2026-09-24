/**
 * F365's embedding pass over `one-term-set.json` with the shipped embedder (multilingual-e5-large-instruct Q6_K),
 * the same prefixes and pooling as docs/qa/embed-multilingual/embed-candidates.mjs. Needs llama.cpp's `llama-embedding`.
 *
 *   node docs/qa/fix-corroboration-door/embed-one-term.mjs /tmp/one-term
 *   INBORN_MEASURE_ONE_TERM=/tmp/one-term pnpm --filter @inborn/core exec vitest run test/rag-one-term-measure.test.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) throw new Error("usage: node embed-one-term.mjs <output directory>");
mkdirSync(out, { recursive: true });
const modelsDir = process.env.INBORN_MODELS_DIR ?? join(here, "../../../.models");
const model = join(modelsDir, "multilingual-e5-large-instruct-Q6_K.gguf");
const QUERY = "Instruct: Given a question, retrieve the passage of a document that answers it\nQuery: ";
const { docs } = JSON.parse(readFileSync(join(here, "one-term-set.json"), "utf8"));

const list = [];
for (const d of docs) {
  list.push({ key: `doc:${d.id}`, line: d.text });
  for (const kind of ["on", "off"]) for (const q of d[kind]) list.push({ key: `q:${d.id}:${kind}:${q}`, line: QUERY + q });
}
const SEP = "<#sep#>";
const prompts = join(out, "prompts.txt");
writeFileSync(prompts, list.map((i) => i.line).join(SEP));
const raw = execFileSync("llama-embedding", ["-m", model, "-f", prompts, "--embd-separator", SEP, "--pooling", "mean", "--embd-normalize", "2", "--embd-output-format", "json", "-c", "2048", "-b", "2048", "-ngl", "99", "--no-warmup"], { maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] }).toString();
const parsed = JSON.parse(raw);
if (parsed.data.length !== list.length) throw new Error(`got ${parsed.data.length} embeddings for ${list.length} inputs`);
const vectors = {};
for (const row of parsed.data) vectors[list[row.index].key] = row.embedding;
writeFileSync(join(out, "vectors.json"), JSON.stringify(vectors));
console.log(`${list.length} texts → ${join(out, "vectors.json")}`);
