// First-pass grader: the ground-truth regexes from items-*.json, the answer's language, truncation and loops.
// A human pass then overrides grades in overrides.json ({ "<set>|<model>|<id>|<sample>": [grade, reason] }), which wins.
// Usage: node grade.mjs  (rewrites results/*.jsonl in place with grade + reason + graded_by)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chineseScriptOf, scriptOf } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const res = join(here, "../results");
const items = {};
for (const i of JSON.parse(readFileSync(join(here, "items-a.json"), "utf8"))) items[`A|${i.id}`] = i;
for (const i of JSON.parse(readFileSync(join(here, "items-b.json"), "utf8"))) for (const q of i.questions) { items[`B|${i.id}/${q.id}`] = q; for (const l of ["es", "ja"]) if (q[l]) items[`B|${i.id}/${q.id}-${l}`] = { ...q }; }
for (const i of JSON.parse(readFileSync(join(here, "items-c.json"), "utf8"))) items[`C|${i.id}`] = i;
const overrides = existsSync(join(here, "overrides.json")) ? JSON.parse(readFileSync(join(here, "overrides.json"), "utf8")) : {};

/* The same facts asked in Spanish or Japanese, matched in any language the answer may use. */
var INTL;
function intl() {
  return {
    "label-real/read": ["19"],
    "dogs-real/count": ["\\b(4|four|cuatro)\\b|4\\s?匹|四匹|4\\s?頭|四頭"],
    "receipt-clean/read": ["15[.,]09"],
    "letter-angle/read": ["(?i)9.{0,6}(abril|april)|4\\s?月\\s?9\\s?日|april 9", "7[:.]30|19[:.]30|7時30|午後7時半|19時30|19時半|7時半"],
  };
}

const STOP = {
  en: ["the", "and", "is", "you", "to", "of", "it", "your", "this", "for", "with", "are", "can", "that"],
  de: ["der", "die", "das", "und", "ist", "nicht", "ich", "sie", "mit", "für", "ein", "eine", "zu", "den", "auf"],
  es: ["el", "la", "de", "que", "en", "los", "es", "por", "para", "una", "con", "las", "su", "del"],
  fr: ["le", "la", "les", "de", "et", "est", "pas", "vous", "pour", "une", "des", "que", "dans", "du", "je"],
  pt: ["de", "que", "é", "do", "da", "não", "para", "uma", "com", "os", "você", "em"],
};
/* Letters only one of the five uses often, so a short answer is not decided by shared words like "de" and "que". */
const MARKS = { en: /\b(the|you|is)\b/gi, de: /[äöüß]/gi, es: /[ñ¿¡]|\b(el|los|está)\b/gi, fr: /[èêà]|\b(je|vous|est)\b/gi, pt: /[ãõ]|\b(não|você|é)\b/gi };
function latinLang(t) {
  const words = t.toLowerCase().match(/[a-zà-ÿ]+/g) ?? [];
  let best = "en", n = -1;
  for (const [l, s] of Object.entries(STOP)) {
    const c = words.filter((w) => s.includes(w)).length + 2 * (t.match(MARKS[l]) ?? []).length;
    if (c > n) { n = c; best = l; }
  }
  return best;
}
/* Strips code, URLs and quoted names so a Japanese answer quoting an English label still reads as Japanese. */
function answerLang(t) {
  const prose = t.replace(/```[\s\S]*?```/g, "").replace(/https?:\S+/g, "");
  if (!/\p{L}/u.test(prose)) return "any";
  const s = scriptOf(prose);
  /* Japanese often has more kanji than kana; any kana means Japanese. */
  if (s === "japanese" || (s === "cjk" && /[\u3040-\u30ff]/.test(prose))) return "ja";
  if (s === "korean") return "ko";
  if (s === "cjk") return chineseScriptOf(prose) === "zh-Hans" ? "zh-Hans" : "zh-Hant";
  if (s === "latin") return latinLang(prose);
  return s;
}
const okLang = (want, got) => got === "any" || want === got;

function looped(t) {
  const lines = t.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 12);
  const seen = new Map();
  for (const l of lines) seen.set(l, (seen.get(l) ?? 0) + 1);
  return [...seen.values()].some((c) => c >= 3);
}

function grade(r) {
  const key = `${r.set}|${r.id}`;
  const item = items[key];
  const t = r.raw.trim();
  const flaws = [];
  if (!t) return [0, "empty answer"];
  const want = r.lang ?? "en";
  /* Translation and photo-of-foreign-text answers legitimately quote other languages; judge the frame language on the rest. */
  const got = answerLang(item?.id === "en-translate" ? t.replace(/["“”«»][^"“”«»]*["“”«»]/g, "") : t);
  if (!okLang(want, got) && !(want === "en" && item?.id === "en-translate")) return [0, `wrong language (${got}, asked ${want})`];
  for (const re of item?.mustNot ?? []) if (new RegExp(re.replace(/^\(\?i\)/, ""), re.startsWith("(?i)") ? "i" : "").test(t)) return [0, `invented/contradicts truth: /${re}/`];
  const missing = (item?.must ?? []).filter((re) => !new RegExp(re.replace(/^\(\?i\)/, ""), re.startsWith("(?i)") ? "i" : "").test(t));
  if (missing.length) return [0, `missing fact: /${missing[0]}/`];
  if (r.finish === "length") flaws.push("cut at max_tokens");
  if (looped(t)) flaws.push("repeats a line 3+ times");
  return flaws.length ? [1, flaws.join("; ")] : [2, item?.must?.length ? "states the ground-truth fact(s), right language" : "right language; content needs the human pass"];
}

INTL = intl();
for (const k of Object.keys(items)) if (k.match(/-(es|ja)$/)) items[k].must = INTL[k.slice(2).replace(/-(es|ja)$/, "")];
for (const f of ["a", "b", "c"].flatMap((s) => ["instant", "fast", "sharp"].map((m) => `${s}-${m}.jsonl`))) {
  const p = join(res, f);
  if (!existsSync(p)) continue;
  const rows = readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  for (const r of rows) {
    const o = overrides[`${r.set}|${r.model}|${r.id}|${r.sample}`];
    const [g, why] = o ?? grade(r);
    Object.assign(r, { grade: g, reason: why, graded_by: o ? "human" : "rubric" });
  }
  writeFileSync(p, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
console.log("graded");
