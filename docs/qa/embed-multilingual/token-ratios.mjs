/**
 * How far `estimateTokens` under-counts against the shipped embedder's own tokenizer, per script (F335). The chunker
 * sizes document chunks from the worst ratio here, because a chunk past the model's 512 positions is truncated on
 * the phone and aborts llama.cpp elsewhere. Needs llama.cpp's `llama-tokenize` and Node >= 22.6 (imports a .ts).
 *
 *   node docs/qa/embed-multilingual/token-ratios.mjs > docs/qa/embed-multilingual/token-ratios.txt
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tmp = join(mkdtempSync(join(tmpdir(), "inborn-tok-")), "tok.txt");
const model = join(process.env.INBORN_MODELS_DIR ?? join(here, "../../../.models"), "multilingual-e5-large-instruct-Q6_K.gguf");
const { estimateTokens: est } = await import(join(here, "../../../packages/core/src/rag/tokens.ts"));
const samples = {
  "he-pointed": "בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ׃ וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ וְחֹשֶׁךְ עַל־פְּנֵי תְהוֹם וְרוּחַ אֱלֹהִים מְרַחֶפֶת עַל־פְּנֵי הַמָּיִם׃ וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר וַיְהִי־אוֹר׃",
  "he-cantill": "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃ וְהָאָ֗רֶץ הָיְתָ֥ה תֹ֙הוּ֙ וָבֹ֔הוּ וְחֹ֖שֶׁךְ עַל־פְּנֵ֣י תְה֑וֹם",
  "he-plain": "בראשית ברא אלהים את השמים ואת הארץ והארץ היתה תהו ובהו וחשך על פני תהום ורוח אלהים מרחפת על פני המים",
  "th": "รายงานประจำปีของบริษัทแสดงให้เห็นว่าบริษัทมีพนักงานทั้งหมดสามร้อยแปดสิบสองคน และมีสำนักงานใหญ่สองแห่ง",
  "ar": "يظهر التقرير السنوي للشركة أن عدد الموظفين بلغ ثلاثمائة واثنين وثمانين موظفا وأن للشركة مكتبين رئيسيين",
  "ru": "Годовой отчёт компании показывает, что в ней работают триста восемьдесят два сотрудника и есть два главных офиса.",
  "ko": "한빛물산의 이천이십오년도 연차 보고서에 따르면 직원 수는 삼백팔십이 명이며 주요 거점은 두 곳이다.",
  "digits": "2025: 382, 1962, 7.4%, 9.1%, 2030-01-01, +972-2-555-0199, 3,141,592.65 12345678901234567890",
  "hi": "कंपनी की वार्षिक रिपोर्ट के अनुसार कर्मचारियों की संख्या तीन सौ बयासी है और दो मुख्य कार्यालय हैं।",
  "emoji": "Great 👍👍 results 🎉🎉🎉 for Q3 🚀 and 😀😀 team ❤️❤️",
  "code": "function f(x){return x.map((y)=>y*2).filter(Boolean);} // TODO: fix_this_later() {}[]<>",
  "el": "Η ετήσια έκθεση της εταιρείας δείχνει ότι απασχολεί τριακόσιους ογδόντα δύο υπαλλήλους.",
};
for (const [k, t0] of Object.entries(samples)) {
  const t = (t0 + " ").repeat(4);
  writeFileSync(tmp, t);
  const out = execFileSync("llama-tokenize", ["-m", model, "-f", tmp, "--ids", "--log-disable"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
  const real = JSON.parse(out.trim().split("\n").pop()).length;
  console.log(k.padEnd(11), "est", String(est(t)).padStart(4), "real", String(real).padStart(4), "ratio", (real / est(t)).toFixed(2));
}
