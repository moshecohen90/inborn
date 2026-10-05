// Asks one model about attached PDFs through the app's own code, before (text route) and after round 130 (the page
// decision of pagePhoto.ts and the photo-turn prompt of Chat.tsx generate()). Needs the e5 server and one chat server.
// Usage: node run-pdf.mjs <instant|fast> <chat port> <e5 port> <samples> <pages dir> <out.jsonl> [pdf filter]
import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as app from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [model, port, e5, nArg, pagesDir, out, filter] = process.argv.slice(2);
const n = Number(nArg);
const N_CTX = 4096;
const IMAGE_TOKENS = { instant: 512, fast: 1024 }[model];
const persona = app.BUILT_IN_PERSONAS[0];
const embedder = {
  id: "embed-e5",
  async embed(texts) {
    const r = await fetch(`http://127.0.0.1:${e5}/v1/embeddings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: texts }) });
    const j = await r.json();
    return j.data.sort((a, b) => a.index - b.index).map((d) => Float32Array.from(d.embedding));
  },
};
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
  return { answer: j.choices[0].message.content ?? "", ms: Date.now() - started, promptTokens: j.usage?.prompt_tokens };
}

/* importImageFile: the scale-2 render, long edge 1024, JPEG 0.85. */
function photoOf(png) {
  const jpg = png.replace(/\.png$/, ".jpg");
  execFileSync("sips", ["-Z", "1024", "-s", "format", "jpeg", "-s", "formatOptions", "85", png, "--out", jpg], { stdio: "ignore" });
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
  const chars = app.charsByPage(await store.chunksOf(name));
  const entry = { doc, dump, chars };
  docs.set(name, entry);
  return entry;
}

async function hitsFor(question, docId) {
  const overview = app.isAboutAttachment(question);
  const hits = overview ? app.openingHits([await store.chunksOf(docId)]) : await retriever.retrieve(question, { docIds: [docId] });
  return { hits, overview };
}

function systemFor(text, photos) {
  const use = app.detectUse({ text, personaId: persona.id, personaIcon: persona.icon, hasDocuments: true });
  const plan = app.planAnswerLength({ text, use });
  return { plan, system: app.turnSystemPrompt({ familySafe: true, tier: model, photos, persona, chatPrompt: "", memory: [], languageHint: app.languageHint(text), length: plan.instruction }) };
}

const rag = (question, retrieved, entry, history, system, nCtx) =>
  app.buildRagPrompt({ question, hits: retrieved.hits, docs: new Map([[entry.doc.id, entry.doc]]), strict: false, embedderId: "embed-e5", nCtx, history, systemPrompt: system, citeMarkers: model !== "instant", overview: retrieved.overview });

const pictures = (messages) => messages.reduce((k, m) => k + (m.images?.length ?? 0), 0) * (IMAGE_TOKENS + 2);

/** One turn of Chat.tsx generate(): the text route, or the photo-turn route when the conversation carries the page. */
async function turn(route, entry, history, text, page, pageNo) {
  let retrieved = await hitsFor(text, entry.doc.id);
  const all = [...history, { role: "user", content: text, ...(page ? { images: [page] } : {}) }];
  const seesPage = route === "after" && all.some((m) => m.images?.length);
  const { plan, system } = systemFor(text, seesPage);
  if (!seesPage) {
    const p = rag(text, retrieved, entry, history, system, N_CTX);
    return { messages: p.messages, used: p.used.length, plan };
  }
  const main = app.buildPrompt({ system, messages: all.map((m, i) => ({ id: String(i), ...m })), nCtx: N_CTX, imageTokens: IMAGE_TOKENS });
  /* Variant PAGE_TEXT=1 (tuning only): the shown page's own passages always join it, whether or not they bear on the question. */
  if (process.env.PAGE_TEXT && page) {
    const doors = app.relevanceDoors("embed-e5");
    const own = (await store.chunksOf(entry.doc.id)).filter((c) => c.page === pageNo).map((chunk) => ({ chunk, score: 1, cosine: 0, bm25: 0, bm25Terms: 0 }));
    const hits = [...own, ...retrieved.hits.filter((h) => app.isRelevant(h, doors) && !own.some((o) => o.chunk.id === h.chunk.id))];
    retrieved = { hits, overview: true };
  }
  const p = rag(text, retrieved, entry, history, system, N_CTX - pictures(main.messages));
  return p.used.length ? { messages: app.withPhotos(p.messages, page ? [page] : undefined), used: p.used.length, plan } : { messages: main.messages, used: 0, plan };
}

/** planPagePhoto for one attached PDF: its only page, else the best passage's page, else page 1; visual or not. */
async function decide(entry, question) {
  const pages = entry.dump.pages.length;
  let page = 1;
  if (pages > 1) {
    const r = await hitsFor(question, entry.doc.id);
    const p = rag(question, r, entry, [], "", N_CTX);
    page = p.used[0]?.chunk.page ?? 1;
  }
  const chars = entry.chars.get(page) ?? 0;
  const ink = entry.dump.pages[page - 1].ink;
  return { page, chars, ink, visual: app.isVisualPage(chars, ink) };
}

const items = JSON.parse(readFileSync(join(here, "items.json"), "utf8")).filter((i) => !filter || new RegExp(filter).test(i.pdf));
for (const item of items) {
  const entry = await load(item.pdf);
  for (const route of ["before", "after"]) {
    for (let s = 1; s <= n; s++) {
      const history = [];
      let last;
      let decision;
      for (const [k, text] of item.turns.entries()) {
        decision = k === 0 ? await decide(entry, text) : decision;
        const page = route === "after" && k === 0 && decision.visual ? photoOf(entry.dump.pages[decision.page - 1].render) : undefined;
        const t = await turn(route, entry, history, text, page, decision.page);
        const r = await complete(t.messages, t.plan.maxTokens);
        history.push({ role: "user", content: text, ...(page ? { images: [page] } : {}) }, { role: "assistant", content: r.answer });
        last = { ...r, used: t.used, images: t.messages.reduce((c, m) => c + (m.images?.length ?? 0), 0) };
      }
      appendFileSync(out, JSON.stringify({ variant: process.env.PAGE_TEXT ? "page-text" : undefined, set: item.set, pdf: item.pdf, id: item.id, model, route, sample: s, turns: item.turns, truth: item.truth, decision, ...last, transcript: history.map((m) => ({ role: m.role, content: m.content, images: m.images?.length ?? 0 })) }) + "\n");
      process.stdout.write(".");
    }
  }
}
console.log(" done");
