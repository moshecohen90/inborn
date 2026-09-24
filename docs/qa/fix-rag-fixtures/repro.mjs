// Recomputes every committed cosine from a fresh vectors file. node repro.mjs <e5 vectors.json> <committed e5-cosines.json>
import { readFileSync } from "node:fs";
import { cosFn } from "./cos.mjs";
const cos = cosFn(process.argv[2]);
const committed = JSON.parse(readFileSync(process.argv[3], "utf8"));
let n = 0, diff = 0, maxd = 0;
for (const d of committed.docs) for (const q of d.questions) { const c = cos(`doc:${d.id}`, `q:${d.id}:${q.kind}:${q.q}`); n++; if (c !== q.cosine) diff++; maxd = Math.max(maxd, Math.abs(c - q.cosine)); }
for (const d of committed.multi ?? []) for (const q of d.questions) q.cosines.forEach((v, i) => { const c = cos(`c:${d.id}:${i}`, `q:${d.id}:${q.kind}:${q.q}`); n++; if (c !== v) diff++; maxd = Math.max(maxd, Math.abs(c - v)); });
console.log(`${n} committed cosines recomputed, ${diff} differ, max |diff| ${maxd.toFixed(4)}`);
