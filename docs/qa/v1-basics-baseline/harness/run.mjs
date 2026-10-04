// Samples one model on one set through the app's own prompt code (lib.mjs) against a local llama-server.
// Usage: node run.mjs <A|B|C> <instant|fast|sharp> <port> <samples> <out.jsonl> [idFilter]
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILT_IN_PERSONAS, buildPrompt, buildRagPrompt, detectUse, languageHint, planAnswerLength, turnSystemPrompt } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [set, model, port, nArg, out, filter] = process.argv.slice(2);
const n = Number(nArg);
const persona = BUILT_IN_PERSONAS[0];
const N_CTX = 4096;
/* Fix experiments only (README "Fixes"): EXTRA_SYSTEM is appended to the system prompt, FORCE_USE replaces detectUse. Unset = the app. */
const EXTRA = process.env.EXTRA_SYSTEM ?? "";
const FORCE_USE = process.env.FORCE_USE;
/* SYS_SWAP: JSON [[from, to], ...] applied to the finished system prompt, so a wording variant is measured in its real place. */
const SWAPS = JSON.parse(process.env.SYS_SWAP ?? "[]");
const swapped = (system) => SWAPS.reduce((s, [from, to]) => s.split(from).join(to), system) + (process.env.SYS_TAIL ? `\n\n${process.env.SYS_TAIL}` : "");

/* The phone's llama.rn wire shape: text part first, then each photo as image_url (adapters/llamaRn.ts). */
const wire = (m) => (m.images?.length ? { role: m.role, content: [{ type: "text", text: m.content }, ...m.images.map((url) => ({ type: "image_url", image_url: { url } }))] } : { role: m.role, content: m.content });

async function complete(messages, maxTokens) {
  const started = Date.now();
  const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: messages.map(wire), temperature: 0.7, top_p: 0.9, repeat_penalty: 1.1, repeat_last_n: 64, max_tokens: maxTokens, chat_template_kwargs: { enable_thinking: false } }),
  });
  const j = await r.json();
  if (!j.choices) throw new Error(JSON.stringify(j).slice(0, 300));
  return { raw: j.choices[0].message.content ?? "", finish: j.choices[0].finish_reason, ms: Date.now() - started, promptTokens: j.usage?.prompt_tokens };
}

/* Chat.tsx generate(): use → length plan → layered system prompt (family-safe on by default) → newest-first packing. */
function chatMessages(history, text, images) {
  const use = FORCE_USE ?? detectUse({ text, personaId: persona.id, personaIcon: persona.icon, hasDocuments: false });
  const plan = planAnswerLength({ text, use });
  const all = [...history, { role: "user", content: text, ...(images ? { images } : {}) }];
  const system = swapped(turnSystemPrompt({ familySafe: true, tier: model, photos: all.some((m) => m.images?.length), persona, chatPrompt: "", memory: [], languageHint: [languageHint(text), EXTRA].filter(Boolean).join(" "), length: plan.instruction }));
  const prompt = buildPrompt({ system, messages: all.map((m, i) => ({ id: String(i), ...m })), nCtx: N_CTX });
  return { messages: prompt.messages, maxTokens: plan.maxTokens, length: plan.length, use };
}

const dataUri = (file) => `data:image/${file.endsWith(".png") ? "png" : "jpeg"};base64,${readFileSync(file).toString("base64")}`;
const keep = (id) => !filter || new RegExp(filter).test(id);

/* A2 and B2 are the held-out sets: same shape as A and B, never used to choose wording. */
const itemsFile = (s) => join(here, `items-${s.toLowerCase()}.json`);
if (set === "A" || set === "A2") {
  for (const item of JSON.parse(readFileSync(itemsFile(set), "utf8")).filter((i) => keep(i.id))) {
    for (let s = 1; s <= n; s++) {
      const history = [];
      let last;
      for (const text of item.turns) {
        const p = chatMessages(history, text);
        const r = await complete(p.messages, p.maxTokens);
        history.push({ role: "user", content: text }, { role: "assistant", content: r.raw });
        last = { ...r, prompt: p.messages, maxTokens: p.maxTokens, length: p.length, use: p.use };
      }
      appendFileSync(out, JSON.stringify({ set, model, id: item.id, lang: item.lang, sample: s, truth: item.truth, variant: process.env.VARIANT, transcript: history, ...last }) + "\n");
      process.stdout.write(".");
    }
  }
}

if (set === "B" || set === "B2") {
  const sized = join(here, "../fixtures/photos/sized");
  for (const item of JSON.parse(readFileSync(itemsFile(set), "utf8"))) {
    /* PHOTOS_EXTRA holds the one fixture kept out of the repo (fixtures/SOURCES.md). */
    const file = [sized, process.env.PHOTOS_EXTRA].filter(Boolean).map((d) => join(d, item.image)).find((f) => existsSync(f)) ?? join(sized, item.image);
    if (!existsSync(file)) throw new Error(`missing ${file}`);
    const uri = dataUri(file);
    const asked = item.questions.flatMap((q) => [q, ...["es", "ja"].filter((l) => q[l]).map((l) => ({ ...q, id: `${q.id}-${l}`, text: q[l], lang: l }))]);
    for (const q of asked.filter((q) => keep(`${item.id}/${q.id}`))) {
      for (let s = 1; s <= n; s++) {
        const p = chatMessages([], q.text, [uri]);
        const r = await complete(p.messages, p.maxTokens);
        appendFileSync(out, JSON.stringify({ set, model, id: `${item.id}/${q.id}`, kind: item.kind, lang: q.lang ?? "en", sample: s, question: q.text, truth: q.truth, variant: process.env.VARIANT, ...r, maxTokens: p.maxTokens, length: p.length }) + "\n");
        process.stdout.write(".");
      }
    }
  }
}

/* Chat.tsx with a file attached: use "documents" → its length line inside the turn's system prompt → library.ask → buildRagPrompt. */
if (set === "C") {
  const retrieved = JSON.parse(readFileSync(join(here, "../results/c-retrieval.json"), "utf8"));
  for (const q of retrieved.filter((q) => keep(q.id))) {
    const use = detectUse({ text: q.question, personaId: persona.id, personaIcon: persona.icon, hasDocuments: true });
    const plan = planAnswerLength({ text: q.question, use });
    const system = swapped(turnSystemPrompt({ familySafe: true, tier: model, photos: false, persona, chatPrompt: "", memory: [], languageHint: languageHint(q.question), length: plan.instruction }));
    const docs = new Map(q.docs.map((d) => [d.id, d]));
    for (let s = 1; s <= n; s++) {
      const p = buildRagPrompt({ question: q.question, hits: q.hits, docs, strict: false, embedderId: "embed-e5", nCtx: N_CTX, history: [], systemPrompt: system, citeMarkers: model !== "instant", overview: q.overview, nonce: "a1b2c3" });
      const r = await complete(p.messages, plan.maxTokens);
      appendFileSync(out, JSON.stringify({ set, model, id: q.id, lang: q.lang, sample: s, question: q.question, truth: q.truth, used: p.used.map((h) => `${h.chunk.docId}#${h.chunk.ord}`), ...r, maxTokens: plan.maxTokens, prompt: p.messages }) + "\n");
      process.stdout.write(".");
    }
  }
}
console.log(" done");
