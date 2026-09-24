// Pseudo-localization: +40% length, accented letters, brackets — catches clipped text before a translator exists.
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const map = { a: "à", e: "é", i: "ï", o: "ô", u: "ü", A: "Å", E: "É", I: "Î", O: "Ö", U: "Ü", c: "ç", n: "ñ", y: "ÿ" };
export const pseudo = (s) => {
  let out = "", depth = 0;
  for (const ch of s) { if (ch === "{") depth++; if (depth === 0) out += map[ch] ?? ch; else out += ch; if (ch === "}") depth--; }
  const pad = "~".repeat(Math.ceil(s.replace(/\{[^}]*\}/g, "").length * 0.4));
  return `[${out}${pad}]`;
};

/** What `pseudo.json` must contain. Exported so the guard can compare the file against it without writing anything. */
export function build() {
  const src = JSON.parse(readFileSync(join(here, "../locales/en.json"), "utf8"));
  return Object.fromEntries(Object.entries(src).map(([k, v]) => [k, pseudo(v)]));
}

const real = (p) => { try { return realpathSync(p); } catch { return p; } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const out = build();
  writeFileSync(join(here, "../locales/pseudo.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`pseudo.json: ${Object.keys(out).length} keys`);
}
