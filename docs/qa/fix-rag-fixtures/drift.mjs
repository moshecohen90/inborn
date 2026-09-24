// How far one text's cosine moves between two embedding runs, over the committed docs whose text did not change.
// node drift.mjs <runA.vectors.json> <runB.vectors.json> <committed e5-cosines.json>
import { readFileSync } from "node:fs";
import { cosFn } from "./cos.mjs";
const a = cosFn(process.argv[2]), b = cosFn(process.argv[3]);
const committed = JSON.parse(readFileSync(process.argv[4], "utf8"));
let n = 0, diff = 0, maxd = 0;
for (const d of committed.docs.filter((x) => !["de", "fr", "es", "pt"].includes(x.lang)))
  for (const q of d.questions) {
    const x = a(`doc:${d.id}`, `q:${d.id}:${q.kind}:${q.q}`), y = b(`doc:${d.id}`, `q:${d.id}:${q.kind}:${q.q}`);
    n++;
    if (x !== y) diff++;
    maxd = Math.max(maxd, Math.abs(x - y));
  }
console.log(`${n} unchanged-text pairs, ${diff} differ by run, max ${maxd.toFixed(4)}`);
