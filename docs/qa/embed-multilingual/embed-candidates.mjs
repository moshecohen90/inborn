/**
 * F333's embedding pass: runs every candidate embedder in `candidates.json` over BOTH fixture sets round 70 used
 * — `../fix-cjk-floor/fixtures.json` (12 one-passage documents, 57 on-topic + 102 off-topic questions) and
 * `../fix-cjk-floor/multichunk.json` (7 six-chunk documents, 21 + 42) — with each model's own prefixes and
 * pooling, and writes one vectors file per candidate plus a latency line. Needs llama.cpp's `llama-embedding`.
 *
 *   node docs/qa/embed-multilingual/embed-candidates.mjs /tmp/multi [candidateId ...]
 *   INBORN_MEASURE_MULTILINGUAL=/tmp/multi pnpm --filter @inborn/core exec vitest run test/rag-multilingual-measure.test.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) throw new Error("usage: node embed-candidates.mjs <output directory> [candidateId ...]");
mkdirSync(out, { recursive: true });
const only = new Set(process.argv.slice(3));

const modelsDir = process.env.INBORN_MODELS_DIR ?? join(here, "../../../.models");
const { candidates } = JSON.parse(readFileSync(join(here, "candidates.json"), "utf8"));
const { docs: singles } = JSON.parse(readFileSync(join(here, "../fix-cjk-floor/fixtures.json"), "utf8"));
const { docs: multis } = JSON.parse(readFileSync(join(here, "../fix-cjk-floor/multichunk.json"), "utf8"));

/** Every text this measurement needs, keyed exactly the way the vitest side reads them back. */
function items(docPrefix, queryPrefix) {
  const list = [];
  for (const d of singles) {
    list.push({ key: `doc:${d.id}`, line: docPrefix + d.text });
    for (const kind of ["on", "off"]) for (const q of d[kind]) list.push({ key: `q:${d.id}:${kind}:${q}`, line: queryPrefix + q });
  }
  for (const d of multis) {
    d.chunks.forEach((c, i) => list.push({ key: `c:${d.id}:${i}`, line: docPrefix + c }));
    for (const kind of ["on", "off"]) for (const q of d[kind]) list.push({ key: `q:${d.id}:${kind}:${q}`, line: queryPrefix + q });
  }
  return list;
}

/* Candidates are added over a round, so a partial rerun must not drop the rows already measured. */
const metaPath = join(out, "meta.json");
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
for (const c of candidates) {
  if (only.size && !only.has(c.id)) continue;
  const model = join(modelsDir, c.file);
  if (!existsSync(model)) {
    console.log(`skip ${c.id}: ${c.file} not in ${modelsDir}`);
    continue;
  }
  for (const pooling of c.pooling) {
    const variant = c.pooling.length > 1 ? `${c.id}+${pooling}` : c.id;
    const list = items(c.docPrefix, c.queryPrefix);
    /* Qwen3-Embedding's query prefix contains a newline, so the prompts cannot be newline-separated. */
    const SEP = "<#sep#>";
    const prompts = join(out, `${variant}.prompts.txt`);
    writeFileSync(prompts, list.map((i) => i.line).join(SEP));
    const args = ["-m", model, "-f", prompts, "--embd-separator", SEP, "--pooling", pooling, "--embd-normalize", "2", "--embd-output-format", "json", "-c", "2048", "-b", "2048", "-ngl", "99", "--no-warmup"];
    const started = Date.now();
    let raw;
    try {
      raw = execFileSync("llama-embedding", args, { maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] }).toString();
    } catch (e) {
      console.log(`FAIL ${variant}: ${String(e.stderr ?? e).slice(-400)}`);
      meta[variant] = { id: c.id, pooling, error: String(e.stderr ?? e).slice(-400) };
      continue;
    }
    const wallMs = Date.now() - started;
    const parsed = JSON.parse(raw);
    if (parsed.data.length !== list.length) throw new Error(`${variant}: got ${parsed.data.length} embeddings for ${list.length} inputs`);
    const vectors = {};
    for (const row of parsed.data) vectors[list[row.index].key] = row.embedding;
    writeFileSync(join(out, `${variant}.vectors.json`), JSON.stringify(vectors));
    meta[variant] = {
      id: c.id,
      family: c.family,
      arch: c.arch,
      params: c.params,
      license: c.license,
      source: c.source,
      file: c.file,
      bytes: statSync(model).size,
      pooling,
      dim: parsed.data[0].embedding.length,
      texts: list.length,
      wallMs,
      msPerText: Number((wallMs / list.length).toFixed(2)),
      baseline: !!c.baseline,
      multilingual: !!c.multilingual,
    };
    console.log(`${variant}: ${list.length} texts, dim ${meta[variant].dim}, ${wallMs} ms (${meta[variant].msPerText} ms/text), ${(meta[variant].bytes / 1e6).toFixed(0)} MB`);
  }
}
writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 1));
console.log(`meta → ${join(out, "meta.json")}`);
