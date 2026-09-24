// Every off-topic cosine of the fixture set, highest first, against the 0.82 door. node door.mjs <e5 vectors.json> <repo root>
import { readFileSync } from "node:fs";
import { cosFn } from "./cos.mjs";
const cos = cosFn(process.argv[2]);
const root = process.argv[3];
const fx = JSON.parse(readFileSync(`${root}/docs/qa/fix-cjk-floor/fixtures.json`, "utf8")).docs;
const mc = JSON.parse(readFileSync(`${root}/docs/qa/fix-cjk-floor/multichunk.json`, "utf8")).docs;
const off = [];
for (const d of fx) for (const q of d.off) off.push({ c: cos(`doc:${d.id}`, `q:${d.id}:off:${q}`), d: d.id, q, s: (d.sloppy ?? []).includes(q) });
for (const d of mc) for (const q of d.off) d.chunks.forEach((_, i) => off.push({ c: cos(`c:${d.id}:${i}`, `q:${d.id}:off:${q}`), d: `${d.id}#${i}`, q, s: (d.sloppy ?? []).includes(q) }));
off.sort((a, b) => b.c - a.c);
console.log("off-topic cosines:", off.length, "; above 0.82:", off.filter((o) => o.c > 0.82).length);
for (const o of off.slice(0, 6)) console.log(o.c, o.d, o.s ? "(sloppy)" : "", o.q);
