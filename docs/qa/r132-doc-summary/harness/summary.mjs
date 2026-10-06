// Mean grades and the time each answer takes, from results/*.jsonl and results/grades.json.
// Phone time = prompt tokens / prefill rate + generated tokens / generation rate, with the iPhone 13 Pro rates measured in
// docs/qa/ios-device-pass-32..36 (raw/devrun-*.json `timings`): text prefill Fast 190–300 tok/s, Instant 400–630 tok/s;
// generation Fast 15–19 tok/s, Instant 32–37 tok/s. The middle of each range is the estimate, the ends its spread.
// Usage: node summary.mjs <results dir>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const grades = JSON.parse(readFileSync(join(dir, "grades.json"), "utf8"));
const RATES = { fast: { prefill: [190, 250, 300], gen: [15, 17, 19] }, instant: { prefill: [400, 500, 630], gen: [32, 35, 37] } };
const QS = ["summarize", "he-summarize", "main-points", "about"];
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f2 = (x) => (Number.isNaN(x) ? "–" : x.toFixed(2));
const sec = (x) => `${Math.round(x)} s`;

for (const model of ["instant", "fast"]) {
  console.log(`\n## ${model}`);
  console.log(`| file | route | ${QS.join(" | ")} |`);
  for (const route of ["before", "after"]) {
    const g = grades[route][model];
    for (const target of Object.keys(g)) console.log(`| ${target} | ${route} | ${QS.map((q) => f2(mean(g[target][q] ?? []))).join(" | ")} |`);
    console.log(`| **all** | **${route}** | ${QS.map((q) => `**${f2(mean(Object.values(g).flatMap((t) => t[q] ?? [])))}**`).join(" | ")} |`);
  }
  const rows = readFileSync(join(dir, `after-${model}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const r = RATES[model];
  console.log(`\nPhone time per answer (after; estimate, low–high) and Mac wall time:`);
  console.log(`| file | question | path | calls | prompt tok | generated tok | phone | Mac |`);
  const keys = [...new Set(rows.map((x) => `${x.target}|${x.q}`))];
  for (const k of keys) {
    const xs = rows.filter((x) => `${x.target}|${x.q}` === k);
    const pt = mean(xs.map((x) => x.promptTokens));
    const ct = mean(xs.map((x) => x.completionTokens));
    const phone = (i) => pt / r.prefill[i] + ct / r.gen[i];
    console.log(`| ${xs[0].target} (${xs[0].pages} p.) | ${xs[0].q} | ${xs[0].path} | ${xs[0].calls.length} | ${Math.round(pt)} | ${Math.round(ct)} | ${sec(phone(1))} (${sec(phone(2))}–${sec(phone(0))}) | ${(mean(xs.map((x) => x.ms)) / 1000).toFixed(1)} s |`);
  }
}
