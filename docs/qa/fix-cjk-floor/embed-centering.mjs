/**
 * F330's second embedding pass: the per-script null bank and the six-chunk documents, with the same prefixes and
 * the same binary as `embed.mjs`. Feeds `packages/core/test/rag-centering-negative.test.ts`'s regeneration mode.
 *
 *   node docs/qa/fix-cjk-floor/embed-centering.mjs /tmp/measure
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) throw new Error("usage: node embed-centering.mjs <output directory>");
mkdirSync(out, { recursive: true });
const model = join(process.env.INBORN_MODELS_DIR ?? join(here, "../../../.models"), "nomic-embed-text-v1.5.f16.gguf");

const items = [];
const { banks } = JSON.parse(readFileSync(join(here, "nullbank.json"), "utf8"));
/* The bank stands in for a passage, so it takes the document prefix, not the query one. */
for (const [lang, lines] of Object.entries(banks)) lines.forEach((t, i) => items.push({ key: `bank:${lang}:${i}`, line: "search_document: " + t }));
const { docs } = JSON.parse(readFileSync(join(here, "multichunk.json"), "utf8"));
for (const d of docs) {
  d.chunks.forEach((c, i) => items.push({ key: `c:${d.id}:${i}`, line: "search_document: " + c }));
  for (const kind of ["on", "off"]) for (const q of d[kind]) items.push({ key: `q:${d.id}:${kind}:${q}`, line: "search_query: " + q });
}
writeFileSync(join(out, "centering-prompts.txt"), items.map((i) => i.line).join("\n") + "\n");
const raw = execFileSync("llama-embedding", ["-m", model, "-f", join(out, "centering-prompts.txt"), "--pooling", "mean", "--embd-normalize", "2", "--embd-output-format", "json", "-c", "2048", "-b", "2048", "-ngl", "99", "--no-warmup"], { maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] }).toString();
const parsed = JSON.parse(raw);
if (parsed.data.length !== items.length) throw new Error(`got ${parsed.data.length} embeddings for ${items.length} inputs`);
const vectors = {};
for (const row of parsed.data) vectors[items[row.index].key] = row.embedding;
writeFileSync(join(out, "centering-vectors.json"), JSON.stringify(vectors));
console.log(`embedded ${items.length} texts → ${join(out, "centering-vectors.json")}`);
