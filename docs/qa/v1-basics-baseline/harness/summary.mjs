// Prints the README tables from the graded results: mean grade and n per row × model.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const res = join(dirname(fileURLToPath(import.meta.url)), "../results");
const models = ["instant", "fast", "sharp"];
const rowOf = {
  A: (r) => (r.lang === "en" ? `en: ${r.id.slice(3)}` : r.lang),
  B: (r) => process.argv[2] === "lang" ? r.lang : r.kind ?? r.id,
  C: (r) => r.id,
};
for (const set of ["A", "B", "C"]) {
  const cells = new Map();
  for (const m of models) {
    const p = join(res, `${set.toLowerCase()}-${m}.jsonl`);
    if (!existsSync(p)) continue;
    for (const r of readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l))) {
      const rows = set === "B" ? [r.kind, `question: ${r.id.split("/")[1].replace(/-(es|ja)$/, "")}`, `asked in ${r.lang}`] : set === "A" ? [rowOf.A(r), r.lang === "en" ? "en (all 12)" : null] : [r.id];
      for (const row of rows.filter(Boolean)) {
        const k = `${row}|${m}`;
        const c = cells.get(k) ?? [0, 0];
        cells.set(k, [c[0] + r.grade, c[1] + 1]);
      }
      const all = cells.get(`ALL|${m}`) ?? [0, 0];
      cells.set(`ALL|${m}`, [all[0] + r.grade, all[1] + 1]);
    }
  }
  const rows = [...new Set([...cells.keys()].map((k) => k.split("|")[0]))];
  console.log(`\n### Set ${set}\n\n| ${set === "A" ? "Prompt / language" : set === "B" ? "Image type / question" : "Question type"} | Instant | Fast | Sharp |\n|---|---|---|---|`);
  for (const row of rows) console.log(`| ${row} | ${models.map((m) => { const c = cells.get(`${row}|${m}`); return c ? `${(c[0] / c[1]).toFixed(2)} (${c[1]})` : "–"; }).join(" | ")} |`);
}
