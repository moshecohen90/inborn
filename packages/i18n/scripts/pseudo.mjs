// Pseudo-localization: +40% length, accented letters, brackets — catches clipped text before a translator exists.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const src = JSON.parse(readFileSync(join(here, "../locales/en.json"), "utf8"));
const map = { a: "à", e: "é", i: "ï", o: "ô", u: "ü", A: "Å", E: "É", I: "Î", O: "Ö", U: "Ü", c: "ç", n: "ñ", y: "ÿ" };
const pseudo = (s) => {
  let out = "", depth = 0;
  for (const ch of s) { if (ch === "{") depth++; if (depth === 0) out += map[ch] ?? ch; else out += ch; if (ch === "}") depth--; }
  const pad = "~".repeat(Math.ceil(s.replace(/\{[^}]*\}/g, "").length * 0.4));
  return `[${out}${pad}]`;
};
const out = Object.fromEntries(Object.entries(src).map(([k, v]) => [k, pseudo(v)]));
writeFileSync(join(here, "../locales/pseudo.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`pseudo.json: ${Object.keys(out).length} keys`);
