// Picture turns through the app's own code: a visual PDF page sent as the turn's picture (Chat.tsx generate(), seesPage)
// and a plain photo from the library. ROUTE=before is main at b3707e81; ROUTE=after adds round 131 (the picture-turn
// prompt, then answerCheck on the finished answer with one silent retry and the honest line).
// Usage: ROUTE=before|after node run-picture.mjs <instant|fast> <chat port> <e5 port> <samples> <pages dir> <photos dir> <out.jsonl> [target filter]
import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as app from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [model, port, e5, nArg, pagesDir, photosDir, out, filter] = process.argv.slice(2);
const route = process.env.ROUTE ?? "before";
const n = Number(nArg);
const N_CTX = 4096;
const IMAGE_TOKENS = Number(process.env.IMAGE_TOKENS) || { instant: 1024, fast: 1024 }[model];
const persona = app.BUILT_IN_PERSONAS[0];
const embedder = {
  id: "embed-e5",
  async embed(texts) {
    const r = await fetch(`http://127.0.0.1:${e5}/v1/embeddings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: texts }) });
    const j = await r.json();
    return j.data.sort((a, b) => a.index - b.index).map((d) => Float32Array.from(d.embedding));
  },
};
/* llamaRn.ts wire(): main sent the text part first, then the pictures; round 131 sends the pictures first. */
const X = new Set((process.env.X ?? "").split(",").filter(Boolean));
const imgParts = (m) => m.images.map((url) => ({ type: "image_url", image_url: { url } }));
const after = route === "after";
const HONEST = "I have your picture, but I could not make it out well enough to give a reliable answer.";
const wire = (m) => (m.images?.length ? { role: m.role, content: after || X.has("imagefirst") ? [...imgParts(m), { type: "text", text: m.content }] : [{ type: "text", text: m.content }, ...imgParts(m)] } : { role: m.role, content: m.content });
async function complete(messages, opts) {
  const started = Date.now();
  const s = app.sampling({ ...opts, ...(X.has("cool") ? { temperature: 0.3 } : {}) });
  const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: messages.map(wire),
      temperature: s.temperature,
      top_p: s.topP,
      repeat_penalty: s.repeatPenalty,
      repeat_last_n: s.repeatLastN,
      max_tokens: opts.maxTokens,
      cache_prompt: process.env.NO_CACHE ? false : true,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  const j = await r.json();
  if (!j.choices) throw new Error(JSON.stringify(j).slice(0, 300));
  return { answer: j.choices[0].message.content ?? "", ms: Date.now() - started, promptTokens: j.usage?.prompt_tokens };
}

/* importImageFile: long edge 1024, JPEG 0.85 (a PDF page is its scale-2 render first). */
function photoOf(file) {
  const jpg = join(dirname(out), `${file.split("/").pop().replace(/\.\w+$/, "")}-${model}-${route}.jpg`);
  execFileSync("sips", ["-Z", "1024", "-s", "format", "jpeg", "-s", "formatOptions", "85", file, "--out", jpg], { stdio: "ignore" });
  return `data:image/jpeg;base64,${readFileSync(jpg).toString("base64")}`;
}

const store = new app.MemoryEmbeddingStore();
const retriever = new app.Retriever(store, embedder, app.embedBudget(512));
const docs = new Map();
async function load(name) {
  if (docs.has(name)) return docs.get(name);
  const dump = JSON.parse(readFileSync(join(pagesDir, `${name}.json`), "utf8"));
  const record = { id: name, name: `${name}.pdf`, kind: "pdf", bytes: 1, pages: dump.pages.length, addedAt: 0, status: "queued", indexedPages: 0, chunkCount: 0, flaggedLines: 0, ocrPages: 0 };
  const opened = { pages: dump.pages.length, page: async (i) => ({ page: i + 1, text: dump.pages[i].text, needsOcr: !dump.pages[i].text.trim() }), close: async () => undefined };
  const doc = await app.indexDocument({ doc: record, opened, embedder, store, chunk: app.chunkFor(512) });
  const entry = { doc, dump, picture: photoOf(dump.pages[0].render) };
  docs.set(name, entry);
  return entry;
}

async function ask(question, entry, system, nCtx) {
  const overview = app.isAboutAttachment(question);
  const hits = overview ? app.openingHits([await store.chunksOf(entry.doc.id)]) : await retriever.retrieve(question, { docIds: [entry.doc.id] });
  return app.buildRagPrompt({ question, hits, docs: new Map([[entry.doc.id, entry.doc]]), strict: false, embedderId: "embed-e5", nCtx, history: [], systemPrompt: system, citeMarkers: model !== "instant", overview, openers: app.DEFAULT_OPENERS, pagePicture: after });
}

/** One fresh picture turn of generate(): the page's (or photo's) picture on the last user message, passages when they bear on it. */
async function turn(target, text) {
  const isDoc = target.kind === "pdf";
  const entry = isDoc ? await load(target.name) : null;
  const picture = isDoc ? entry.picture : (target.picture ??= photoOf(join(photosDir, target.file)));
  const use = app.detectUse({ text, personaId: persona.id, personaIcon: persona.icon, hasDocuments: isDoc });
  const length = app.planAnswerLength({ text, use });
  const system = app.turnSystemPrompt({ familySafe: true, tier: model, photos: true, persona, chatPrompt: "", memory: [], languageHint: app.languageHint(text), length: length.instruction, ...(after ? { picture: isDoc ? "page" : "photo" } : {}) });
  let sys = system;
  if (X.has("nocrisis")) sys = sys.replace(" If the user talks about harming themselves, respond with care and suggest talking to someone they trust or a crisis line.", "");
  if (X.has("seeline")) sys = `${sys}\n\n${isDoc ? "The picture in the user's message is a page of their file. You can see it: answer from what it shows." : "You can see the picture in the user's message: answer from what it shows."}`;
  if (X.has("seeline2")) sys = `${sys}\n\n${isDoc ? "This message comes with a picture of a page of an attached file, and you can see it. Answer from what the picture shows." : "This message comes with a picture, and you can see it. Answer from what the picture shows."}`;
  const user = { role: "user", content: text, images: [picture] };
  const main = app.buildPrompt({ system: sys, messages: [{ id: "0", ...user }], nCtx: N_CTX, reserve: app.replyReserve?.(length.maxTokens), imageTokens: IMAGE_TOKENS });
  let messages = main.messages;
  let rag = null;
  if (isDoc) {
    const pictures = IMAGE_TOKENS + app.IMAGE_WRAPPER_TOKENS;
    const p = await ask(text, entry, sys, N_CTX - pictures);
    if (p.used.length) {
      rag = p;
      if (X.has("ragpic")) p.messages[0].content = p.messages[0].content.replace(/Answer from the passages of the user's files between (<<<DOCUMENTS \w+>>>) and (<<<END DOCUMENTS \w+>>>), each numbered \[n\] with its file and page\./, "The text found on that page is between $1 and $2, numbered [n] with its file and page; use it for exact words and names.");
      messages = app.withPhotos(p.messages, [picture]);
    }
  }
  return { messages, rag, length };
}

const targets = JSON.parse(readFileSync(join(here, "targets.json"), "utf8")).filter((t) => !filter || new RegExp(filter).test(t.name));
const questions = JSON.parse(readFileSync(join(here, "questions.json"), "utf8"));
for (const target of targets) {
  for (const q of questions) {
    for (let s = 1; s <= n; s++) {
      const t = await turn(target, q.text);
      const opts = { maxTokens: t.length.maxTokens, ...(after ? app.PICTURE_SAMPLING : {}) };
      const facts = { pictureSent: true, sources: t.rag ? t.rag.citations.map((c) => app.citationLabel(c)) : [], instructions: t.messages[0].content, question: q.text };
      const attempts = [];
      let r;
      let shown;
      let honest = false;
      if (!after) {
        r = await complete(t.messages, opts);
        shown = r.answer;
      } else {
        /* Chat.tsx generate(): the app's own checkedAnswer over the finished completion, streamed back word by word. */
        const stream = async function* (again) {
          r = await complete(t.messages, again ? { ...opts, ...app.PICTURE_RETRY } : opts);
          attempts.push(r.answer);
          for (const piece of r.answer.match(/\S+\s*|\s+/g) ?? []) yield { text: piece };
          yield { done: { promptTokens: r.promptTokens, completionTokens: 0, ttftMs: 0, tokPerSec: 0 } };
        };
        const faults = [];
        let out = "";
        for await (const d of app.checkedAnswer({ start: stream, stop: () => undefined, cancelled: () => false, facts, honest: HONEST, onFault: (f, a) => faults.push(`${f}@${a + 1}`) })) if (d.text) out += d.text;
        honest = out === HONEST;
        shown = out;
        r.faults = faults;
      }
      const first = attempts[0] ?? r.answer;
      const retried = attempts.length > 1;
      const verdict = after ? { faults: r.faults, mended: !honest && shown.trim() !== (attempts.at(-1) ?? "").trim() } : null;
      const userMsg = t.messages.at(-1);
      appendFileSync(
        out,
        JSON.stringify({ route, model, target: target.name, kind: target.kind, q: q.id, lang: q.lang, sample: s, answer: shown, first, retried, honest, verdict, attempts, used: t.rag?.used.length ?? 0, sources: facts.sources, promptTokens: r.promptTokens, ms: r.ms, system: t.messages[0].content, user: userMsg.content, images: t.messages.reduce((k, m) => k + (m.images?.length ?? 0), 0) }) + "\n",
      );
      process.stdout.write(".");
    }
  }
}
console.log(" done");
