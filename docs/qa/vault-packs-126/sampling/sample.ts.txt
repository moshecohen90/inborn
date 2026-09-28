import { readFileSync, writeFileSync } from "node:fs";
import { buildRagPrompt, planAnswerLength, withoutEchoedLabels, type DocumentRecord, type RetrievalHit } from "/Users/moshecohen/dev/inborn-wt/vault-packs-126/packages/core/src/index";

const [port, nArg, out] = process.argv.slice(2);
const n = Number(nArg);
const OFFICE = readFileSync("/private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/journeys/office.txt", "utf8").trim();
const MATCH = "What is the support phone number and when does the office close?";
const doc: DocumentRecord = { id: "d", name: "office.txt", kind: "txt", bytes: 209, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0 };
const chunk = { id: "c", docId: "d", page: 1, ord: 0, text: OFFICE, start: 0, end: OFFICE.length, tokens: 60 };
const kept: RetrievalHit = { chunk, score: 1, cosine: 0.9, bm25: 4, bm25Terms: 4 };
const length = planAnswerLength({ text: MATCH, use: "documents" });
/* The Ask sheet on Instant: length line as system prompt, no cite marks, English, not strict. */
const p = buildRagPrompt({ question: MATCH, hits: [kept], docs: new Map([[doc.id, doc]]), strict: false, nCtx: 4096, answerLanguage: "en", citeMarkers: false, systemPrompt: length.instruction });
const lines: string[] = [`prompt: ${JSON.stringify(p.messages)}`, `max_tokens ${length.maxTokens}`, ""];
let echoed = 0, openMark = 0, has = 0, flashes = 0, subject = 0;
for (let i = 0; i < n; i++) {
  const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: p.messages, temperature: 0.7, top_p: 0.9, repeat_penalty: 1.1, repeat_last_n: 64, max_tokens: length.maxTokens, chat_template_kwargs: { enable_thinking: false } }) });
  const raw: string = ((await r.json()) as { choices: { message: { content: string } }[] }).choices[0]!.message.content;
  const shown = withoutEchoedLabels(raw);
  const dropped = shown !== raw;
  if (dropped) echoed++;
  if (/^\s*\[\d+\]\s*[A-Z]/.test(shown) && !/^\s*\[\d+\]\s*office/.test(shown)) openMark++;
  if (/555-0134/.test(shown) && /\b6\b/.test(shown)) has++;
  if (/^\s*\[\d+\]\s*office\.txt · part 1 \S/.test(raw)) subject++;
  /* The stream, one character at a time: every frame on screen must be the start of the final text. */
  for (let k = 1; k <= raw.length; k++) {
    const frame = withoutEchoedLabels(raw.slice(0, k), { streaming: true, citations: p.citations });
    if (!shown.startsWith(frame)) { flashes++; lines.push(`#${i + 1} FLASH at ${k}: ${JSON.stringify(frame)}`); break; }
  }
  lines.push(`#${i + 1} ${dropped ? "LABEL DROPPED" : "unchanged"}`, `raw:   ${JSON.stringify(raw)}`, ...(dropped ? [`shown: ${JSON.stringify(shown)}`] : []), "");
}
lines.splice(2, 0, `Instant matching n=${n}: raw first line only a label ${echoed} (dropped) · label as the sentence's subject ${subject} (kept) · shown opens "[n] <sentence>" ${openMark} · streamed answers with a frame that later vanished ${flashes} · shown has 555-0134 and 6 ${has}`);
writeFileSync(out, lines.join("\n") + "\n");
console.log(lines[2]);
