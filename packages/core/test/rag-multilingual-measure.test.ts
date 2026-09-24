import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Bm25Index } from "../src/rag/bm25";
import { cosineQuantized, normalize, quantize } from "../src/rag/vector";

/**
 * F333. Every candidate multilingual embedder, over the two fixture sets round 70 measured the shipped one on,
 * scored with the phone's own quantized cosine and the real lexical index. Writes the tables in
 * `docs/qa/embed-multilingual/measure.md` and the committed numbers in `fixtures/rag/multilingual.json`.
 *
 *   node docs/qa/embed-multilingual/embed-candidates.mjs /tmp/multi
 *   INBORN_MEASURE_MULTILINGUAL=/tmp/multi pnpm --filter @inborn/core exec vitest run test/rag-multilingual-measure.test.ts
 */
const QA = join(__dirname, "../../../docs/qa/embed-multilingual");
const OLD_QA = join(__dirname, "../../../docs/qa/fix-cjk-floor");
const DIR = process.env.INBORN_MEASURE_MULTILINGUAL;

interface SingleDoc {
  id: string;
  lang: string;
  text: string;
  on: string[];
  off: string[];
}
interface MultiDoc {
  id: string;
  lang: string;
  chunks: string[];
  answers: number;
  on: string[];
  off: string[];
}

/** One candidate's whole result: what the lead needs to pick a winner. */
export interface CandidateResult {
  variant: string;
  family: string;
  arch: string;
  params: string;
  license: string;
  source: string;
  bytes: number;
  dim: number;
  pooling: string;
  msPerText: number;
  /** Multi-chunk: for how many of the 21 on-topic questions the answering chunk is the embedder's top chunk. */
  answerFirst: number;
  answerFirstByLang: Record<string, [number, number]>;
  /** Single-passage, round-70 rule (the cosine only corroborates a shared word). */
  rule70: { on: number; off: number };
  /** Single-passage, round-70 rule OR a cosine standing alone at the best T that cites nothing off-topic there. */
  cosAlone: { T: number; on: number; off: number; margin: number };
  /** The same, at the T that cites nothing off-topic in EITHER fixture set — the only T that could ship. */
  joint: { T: number; on: number; off: number; margin: number };
  /** The joint door applied to the six-chunk documents, where citing the wrong chunk is visible. */
  multiDoor: { on: number; right: number; wrongOnly: number; off: number };
  onByLang: Record<string, [number, number]>;
  /** How recall falls as T is raised past the fitted one: the headroom a shipped threshold can buy. */
  headroom: Array<{ T: number; on: number; off: number }>;
  /** Everything at SHIPPED_MIN_COSINE, the round number the app actually uses. */
  shipped: { T: number; on: number; off: number; multiOn: number; multiRight: number; multiWrongOnly: number; multiOff: number };
}

const ON_TOTAL = 57;
const OFF_TOTAL = 102;
const MC_ON = 21;
/** The cosine door the app ships with the multilingual embedder; see docs/qa/embed-multilingual/measure.md. */
const SHIPPED_MIN_COSINE = 0.82;
/** The candidate the catalog ships as `embed-e5`; its per-question cosines are committed for the guards. */
const SHIPPED_VARIANT = "e5-large-inst-q6";

const round70 = (r: { terms: number; bm25: number; cos: number }) => r.terms >= 2 || (r.terms >= 1 && (r.bm25 >= 2.0 || r.cos >= 0.5));

function score(dir: string, variant: string, meta: Record<string, string | number>): CandidateResult {
  const vectors = JSON.parse(readFileSync(join(dir, `${variant}.vectors.json`), "utf8")) as Record<string, number[]>;
  const singles = JSON.parse(readFileSync(join(OLD_QA, "fixtures.json"), "utf8")).docs as SingleDoc[];
  const multis = JSON.parse(readFileSync(join(OLD_QA, "multichunk.json"), "utf8")).docs as MultiDoc[];
  const f32 = (key: string) => {
    const v = vectors[key];
    if (!v) throw new Error(`${variant}: no embedding for ${key}`);
    return Float32Array.from(v);
  };

  const rows: Array<{ doc: string; lang: string; kind: "on" | "off"; q: string; terms: number; bm25: number; cos: number }> = [];
  for (const d of singles) {
    const { q, scale } = quantize(f32(`doc:${d.id}`));
    const idx = new Bm25Index();
    idx.add(d.id, d.text);
    for (const kind of ["on", "off"] as const)
      for (const question of d[kind]) {
        const qv = normalize(f32(`q:${d.id}:${kind}:${question}`));
        const hit = idx.search(question, 5)[0];
        rows.push({ doc: d.id, lang: d.lang, kind, q: question, terms: hit?.matched ?? 0, bm25: Number((hit?.score ?? 0).toFixed(3)), cos: Number(cosineQuantized(q, scale, qv).toFixed(4)) });
      }
  }

  const rule70 = { on: rows.filter((r) => r.kind === "on" && round70(r)).length, off: rows.filter((r) => r.kind === "off" && round70(r)).length };

  /* Every chunk of every six-chunk document scored against every question, so the joint threshold can see them too. */
  const mc: Array<{ lang: string; kind: "on" | "off"; answer: number; top: number; per: Array<{ cos: number; bm25: number; terms: number }> }> = [];
  for (const d of multis) {
    const chunks = d.chunks.map((c, i) => ({ i, ...quantize(f32(`c:${d.id}:${i}`)) }));
    const idx = new Bm25Index();
    for (const c of chunks) idx.add(String(c.i), d.chunks[c.i]!);
    for (const kind of ["on", "off"] as const)
      for (const question of d[kind]) {
        const qv = normalize(f32(`q:${d.id}:${kind}:${question}`));
        const lex = new Map(idx.search(question, 10).map((h) => [h.id, h]));
        const per = chunks.map((c) => {
          const h = lex.get(String(c.i));
          return { cos: Number(cosineQuantized(c.q, c.scale, qv).toFixed(4)), bm25: Number((h?.score ?? 0).toFixed(3)), terms: h?.matched ?? 0 };
        });
        mc.push({ lang: d.lang, kind, answer: d.answers, top: per.reduce((bestAt, p, i) => (p.cos > per[bestAt]!.cos ? i : bestAt), 0), per });
      }
  }

  let answerFirst = 0;
  const answerFirstByLang: Record<string, [number, number]> = {};
  for (const r of mc.filter((x) => x.kind === "on")) {
    const cur = answerFirstByLang[r.lang] ?? [0, 0];
    answerFirstByLang[r.lang] = [cur[0] + (r.top === r.answer ? 1 : 0), cur[1] + 1];
    if (r.top === r.answer) answerFirst++;
  }

  /* The cosine allowed to stand alone again: T is the highest cosine no off-topic question reaches, so the door adds recall without a single false citation by construction. `cosAlone` sweeps the one-passage set alone the way the round-72 bar is written; `joint` sweeps both sets, and only that T could ship, because the six-chunk documents are the same app. */
  const sweep = (offCos: number[]) => {
    const T = offCos.length ? Math.max(...offCos) : 0;
    const door = (r: { terms: number; bm25: number; cos: number }) => round70(r) || r.cos > T;
    const added = rows.filter((r) => r.kind === "on" && !round70(r) && r.cos > T).map((r) => r.cos);
    return {
      T: Number(T.toFixed(4)),
      door,
      on: rows.filter((r) => r.kind === "on" && door(r)).length,
      off: rows.filter((r) => r.kind === "off" && door(r)).length,
      margin: added.length ? Number((Math.min(...added) - T).toFixed(4)) : 0,
    };
  };
  const singleOff = rows.filter((r) => r.kind === "off" && !round70(r)).map((r) => r.cos);
  const multiOff = mc.filter((r) => r.kind === "off").flatMap((r) => r.per.filter((p) => !round70(p)).map((p) => p.cos));
  const cosAlone = sweep(singleOff);
  const jointSweep = sweep([...singleOff, ...multiOff]);
  const { door, ...joint } = jointSweep;

  const onByLang: Record<string, [number, number]> = {};
  for (const r of rows.filter((x) => x.kind === "on")) {
    const cur = onByLang[r.lang] ?? [0, 0];
    onByLang[r.lang] = [cur[0] + (door(r) ? 1 : 0), cur[1] + 1];
  }

  const multiDoor = { on: 0, right: 0, wrongOnly: 0, off: 0 };
  for (const r of mc) {
    const cited = r.per.map((p, i) => ({ i, ok: door(p) })).filter((x) => x.ok);
    if (r.kind === "off") multiDoor.off += cited.length ? 1 : 0;
    else if (cited.length) {
      multiDoor.on++;
      if (cited.some((c) => c.i === r.answer)) multiDoor.right++;
      else multiDoor.wrongOnly++;
    }
  }

  /* T is fitted at the highest off-topic cosine, so it has no headroom by construction; this is what buying some costs. */
  const headroom = [0, 0.01, 0.02, 0.03, 0.05].map((extra) => {
    const t = jointSweep.T + extra;
    const open = (r: { terms: number; bm25: number; cos: number }) => round70(r) || r.cos > t;
    return { T: Number(t.toFixed(4)), on: rows.filter((r) => r.kind === "on" && open(r)).length, off: rows.filter((r) => r.kind === "off" && open(r)).length };
  });

  /* The threshold the app ships: a round number above the highest off-topic cosine of both quantizations, so a requant does not move it. */
  const shippedDoor = (r: { terms: number; bm25: number; cos: number }) => round70(r) || r.cos > SHIPPED_MIN_COSINE;
  const shippedMulti = { on: 0, right: 0, wrongOnly: 0, off: 0 };
  for (const r of mc) {
    const cited = r.per.map((p, i) => ({ i, ok: shippedDoor(p) })).filter((x) => x.ok);
    if (r.kind === "off") shippedMulti.off += cited.length ? 1 : 0;
    else if (cited.length) {
      shippedMulti.on++;
      if (cited.some((c) => c.i === r.answer)) shippedMulti.right++;
      else shippedMulti.wrongOnly++;
    }
  }
  const shipped = {
    T: SHIPPED_MIN_COSINE,
    on: rows.filter((r) => r.kind === "on" && shippedDoor(r)).length,
    off: rows.filter((r) => r.kind === "off" && shippedDoor(r)).length,
    multiOn: shippedMulti.on,
    multiRight: shippedMulti.right,
    multiWrongOnly: shippedMulti.wrongOnly,
    multiOff: shippedMulti.off,
  };

  return {
    variant,
    family: String(meta.family ?? ""),
    arch: String(meta.arch ?? ""),
    params: String(meta.params ?? ""),
    license: String(meta.license ?? ""),
    source: String(meta.source ?? ""),
    bytes: Number(meta.bytes ?? 0),
    dim: Number(meta.dim ?? 0),
    pooling: String(meta.pooling ?? ""),
    msPerText: Number(meta.msPerText ?? 0),
    answerFirst,
    answerFirstByLang,
    rule70,
    cosAlone,
    joint,
    multiDoor,
    onByLang,
    headroom,
    shipped,
  };
}

const LANGS = ["de", "en", "es", "fr", "he", "ja", "ko", "pt", "zh"];
const MC_LANGS = ["de", "en", "fr", "he", "ja", "ko", "zh"];
const mb = (n: number) => `${(n / 1e6).toFixed(0)} MB`;

function tables(results: CandidateResult[]): string {
  const L: string[] = [];
  L.push("# Every multilingual embedder llama.rn can run, measured (F333)");
  L.push("");
  L.push("Same two fixture sets, same scorer, same quantized cosine as round 70 (`docs/qa/fix-cjk-floor`): 12 one-passage");
  L.push("documents with 57 on-topic and 102 off-topic questions, and 7 six-chunk documents with 21 and 42. Each model runs");
  L.push("with the prefixes and pooling its authors trained it with, through llama.cpp's `llama-embedding`, then through");
  L.push("`quantize()`/`cosineQuantized()` from `packages/core/src/rag/vector.ts`, so the cosine is the phone's cosine.");
  L.push("Regenerate: `node docs/qa/embed-multilingual/embed-candidates.mjs /tmp/multi` then the env-gated");
  L.push("`packages/core/test/rag-multilingual-measure.test.ts`.");
  L.push("");
  L.push("## The bar");
  L.push("");
  L.push(`Ranks the answering chunk first for at least 18 of ${MC_ON}, **and** some cosine threshold T gives at least 50 of ${ON_TOTAL}`);
  L.push(`on-topic questions a citation with 0 of ${OFF_TOTAL} off-topic ones. Nothing below that ships.`);
  L.push("");
  L.push("## Multi-chunk ranking — the measurement that decides it");
  L.push("");
  L.push("For how many of the 21 on-topic questions is the chunk that answers the question the embedder's top chunk?");
  L.push("");
  L.push(`| candidate | pooling | answering chunk first | ${MC_LANGS.join(" | ")} |`);
  L.push(`|---|---|---|${MC_LANGS.map(() => "---").join("|")}|`);
  for (const r of results) L.push(`| ${r.variant} | ${r.pooling} | **${r.answerFirst}/${MC_ON}** | ${MC_LANGS.map((l) => (r.answerFirstByLang[l] ? `${r.answerFirstByLang[l]![0]}/${r.answerFirstByLang[l]![1]}` : "–")).join(" | ")} |`);
  L.push("");
  L.push("## The relevance door, one-passage documents");
  L.push("");
  L.push("`rule 70` is what ships: the cosine may only corroborate a shared word. `cos ≥ T` re-opens the cosine-alone branch");
  L.push("at the highest T no off-topic question reaches, so the extra recall costs no false citation by construction; `margin`");
  L.push("is the gap between T and the lowest on-topic cosine it lets through.");
  L.push("");
  L.push("| candidate | rule 70 on | rule 70 off | T | +cos>T on | +cos>T off | margin |");
  L.push("|---|---|---|---|---|---|---|");
  for (const r of results) L.push(`| ${r.variant} | ${r.rule70.on}/${ON_TOTAL} | ${r.rule70.off}/${OFF_TOTAL} | ${r.cosAlone.T} | **${r.cosAlone.on}/${ON_TOTAL}** | ${r.cosAlone.off}/${OFF_TOTAL} | ${r.cosAlone.margin} |`);
  L.push("");
  L.push("## The threshold that could actually ship");
  L.push("");
  L.push("The table above picks T on the one-passage set alone, which is how the round-72 bar is written. But the phone runs");
  L.push("one door over every document, and a six-chunk document offers the same question six cosines instead of one, so a T");
  L.push("tuned on one-passage documents lets off-topic questions through on multi-chunk ones. `T joint` is the highest");
  L.push("threshold that cites **nothing** off-topic in either set — the only one that could be shipped.");
  L.push("");
  L.push("| candidate | T joint | on-topic 1-passage | off | multi-chunk on-topic | right | wrong only | multi off |");
  L.push("|---|---|---|---|---|---|---|---|");
  for (const r of results) L.push(`| ${r.variant} | ${r.joint.T} | **${r.joint.on}/${ON_TOTAL}** | ${r.joint.off}/${OFF_TOTAL} | ${r.multiDoor.on}/${MC_ON} | ${r.multiDoor.right} | ${r.multiDoor.wrongOnly} | ${r.multiDoor.off}/42 |`);
  L.push("");
  L.push("## Per language, on-topic cited under `rule 70 OR cos > T joint`");
  L.push("");
  L.push(`| candidate | ${LANGS.join(" | ")} |`);
  L.push(`|---|${LANGS.map(() => "---").join("|")}|`);
  for (const r of results) L.push(`| ${r.variant} | ${LANGS.map((l) => (r.onByLang[l] ? `${r.onByLang[l]![0]}/${r.onByLang[l]![1]}` : "–")).join(" | ")} |`);
  L.push("");
  L.push("## Size, licence and cost");
  L.push("");
  L.push("`ms/text` is wall clock on this Mac (M-series, Metal) over the whole 400-text pass including model load, a proxy");
  L.push("for the phone, not a phone number.");
  L.push("");
  L.push("| candidate | family | arch | params | dim | file | licence | ms/text | source |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of results) L.push(`| ${r.variant} | ${r.family} | ${r.arch} | ${r.params} | ${r.dim} | ${mb(r.bytes)} | ${r.license} | ${r.msPerText} | \`${r.source}\` |`);
  L.push("");
  const passes = results.filter((r) => r.answerFirst >= 18 && r.joint.on >= 50 && r.joint.off === 0);
  L.push("## What passes the bar");
  L.push("");
  if (!passes.length) L.push("Nothing.");
  else {
    L.push(`| candidate | answering chunk first | on-topic | off-topic | wrong-only citations | file |`);
    L.push("|---|---|---|---|---|---|");
    for (const r of passes) L.push(`| ${r.variant} | ${r.answerFirst}/${MC_ON} | ${r.joint.on}/${ON_TOTAL} | ${r.joint.off}/${OFF_TOTAL} | ${r.multiDoor.wrongOnly} | ${mb(r.bytes)} |`);
  }
  L.push("");
  L.push(`## Everything at the shipped threshold, cos > ${SHIPPED_MIN_COSINE}`);
  L.push("");
  L.push("A round number, chosen above the highest off-topic cosine of **both** quantizations of the winner, so a requant");
  L.push("cannot move it under the door. This is the row the guard asserts.");
  L.push("");
  L.push("| candidate | on-topic | off-topic | multi-chunk on-topic | right | wrong only | multi off-topic |");
  L.push("|---|---|---|---|---|---|---|");
  for (const r of results) L.push(`| ${r.variant} | **${r.shipped.on}/${ON_TOTAL}** | ${r.shipped.off}/${OFF_TOTAL} | ${r.shipped.multiOn}/${MC_ON} | ${r.shipped.multiRight} | ${r.shipped.multiWrongOnly} | ${r.shipped.multiOff}/42 |`);
  L.push("");
  L.push("## Headroom above the fitted threshold");
  L.push("");
  L.push("`T joint` is fitted at the highest off-topic cosine in 144 questions, so it has **no** headroom by construction:");
  L.push("one unseen off-topic question above it would be cited. This is what buying headroom costs the passing candidates.");
  L.push("");
  L.push(`| candidate | ${[0, 0.01, 0.02, 0.03, 0.05].map((e) => `T+${e}`).join(" | ")} |`);
  L.push(`|---|${[0, 0, 0, 0, 0].map(() => "---").join("|")}|`);
  for (const r of passes.length ? passes : results.slice(0, 3)) L.push(`| ${r.variant} | ${r.headroom.map((h) => `${h.on}/${ON_TOTAL}, ${h.off} off`).join(" | ")} |`);
  L.push("");
  L.push("## What this changes");
  L.push("");
  L.push("The shipped embedder answers document questions in English and, outside it, measures the language rather than the");
  L.push("topic. That is the whole of round 70 and round 70b: German 0/3, French 0/3, and the answering chunk ranked first for");
  L.push("3 of 21 questions. It is not a floor that can be tuned — `nomic-embed-text-v1.5` is Nomic's **English** model.");
  L.push("");
  L.push("An embedder trained on 100 languages fixes it at the source. The winner ranks the answering chunk first for 20 of 21");
  L.push("questions, 3/3 in German, French, Hebrew, Japanese and Korean, and **never** cites a wrong chunk while citing no");
  L.push("right one. The cosine can stand on its own again, which is what round 70 had to give up.");
  L.push("");
  L.push("Two things this does not fix, both pre-existing and unchanged by the swap:");
  L.push("");
  L.push("1. Three of the 42 off-topic multi-chunk questions are still cited. Every one is cited by the **lexical** half —");
  L.push("   an off-topic question that happens to share two content words with a chunk of the same company report. The");
  L.push("   shipped embedder cites the same three. The cosine door adds none.");
  L.push("2. The threshold is fitted, not derived. It sits above the highest off-topic cosine in 144 questions with a few");
  L.push("   thousandths of headroom, and the table above prices more.");
  L.push("");
  return L.join("\n") + "\n";
}

/** Every cosine of one candidate, per question, in the shape of `cjk-cosines.json` plus the six-chunk documents. */
function perQuestion(dir: string, variant: string, meta: Record<string, string | number>) {
  const vectors = JSON.parse(readFileSync(join(dir, `${variant}.vectors.json`), "utf8")) as Record<string, number[]>;
  const singles = JSON.parse(readFileSync(join(OLD_QA, "fixtures.json"), "utf8")).docs as SingleDoc[];
  const multis = JSON.parse(readFileSync(join(OLD_QA, "multichunk.json"), "utf8")).docs as MultiDoc[];
  const f32 = (key: string) => Float32Array.from(vectors[key]!);
  const cos = (text: string, q: string) => {
    const { q: qq, scale } = quantize(f32(text));
    return Number(cosineQuantized(qq, scale, normalize(f32(q))).toFixed(4));
  };
  const candidates = JSON.parse(readFileSync(join(QA, "candidates.json"), "utf8")).candidates as Array<{ id: string; docPrefix: string; queryPrefix: string }>;
  const c = candidates.find((x) => x.id === meta.id)!;
  return {
    embedder: String(meta.source ?? ""),
    prefixes: [c.docPrefix, c.queryPrefix],
    measured: "llama-embedding --pooling mean --embd-normalize 2, then the app's own quantize()/cosineQuantized() (packages/core/src/rag/vector.ts)",
    why: "The shipped embedder's real cosines for round 70's questions, so the relevance door is guarded on the numbers the phone produces (F334).",
    docs: singles.map((d) => ({ id: d.id, lang: d.lang, text: d.text, questions: (["on", "off"] as const).flatMap((kind) => d[kind].map((q) => ({ kind, q, cosine: cos(`doc:${d.id}`, `q:${d.id}:${kind}:${q}`) }))) })),
    multi: multis.map((d) => ({ id: d.id, lang: d.lang, answers: d.answers, chunks: d.chunks, questions: (["on", "off"] as const).flatMap((kind) => d[kind].map((q) => ({ kind, q, cosines: d.chunks.map((_, i) => cos(`c:${d.id}:${i}`, `q:${d.id}:${kind}:${q}`)) }))) })),
  };
}

describe.skipIf(!DIR)("F333 · every candidate multilingual embedder, measured", () => {
  it("scores every candidate and writes the tables", () => {
    const dir = DIR!;
    const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as Record<string, Record<string, string | number>>;
    const variants = readdirSync(dir)
      .filter((f) => f.endsWith(".vectors.json"))
      .map((f) => f.replace(".vectors.json", ""));
    const order = Object.keys(meta).filter((v) => variants.includes(v));
    const results = order.map((v) => score(dir, v, meta[v]!));
    expect(results.length).toBeGreaterThan(0);
    writeFileSync(join(QA, "measure.md"), tables(results));
    writeFileSync(join(__dirname, "fixtures/rag/multilingual.json"), JSON.stringify({ results }, null, 1));
    if (meta[SHIPPED_VARIANT]) writeFileSync(join(__dirname, "fixtures/rag/e5-cosines.json"), JSON.stringify(perQuestion(dir, SHIPPED_VARIANT, meta[SHIPPED_VARIANT]!), null, 1));
    for (const r of results) console.log(`${r.variant}: answerFirst ${r.answerFirst}/${MC_ON} · T=${r.cosAlone.T} → ${r.cosAlone.on}/${ON_TOTAL} on, ${r.cosAlone.off}/${OFF_TOTAL} off · ${mb(r.bytes)}`);
  });
});
