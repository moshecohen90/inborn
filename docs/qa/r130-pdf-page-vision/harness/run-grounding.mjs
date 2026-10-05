// Grounding when the file gives the model little or nothing (round 130 follow-up): "none" = files attached and no passage
// matched (the plain prompt with the no-passage opener); "thin" = a turn about a page with only crumbs of text and no
// picture (a model that cannot see). ROUTE=before is today's prompt; ROUTE=after the round-130 one (thinPage).
// Usage: ROUTE=before|after node run-grounding.mjs <instant|fast> <chat port> <e5 port> <samples> <pages dir> <out.jsonl> [pdf filter]
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as app from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [model, port, e5, nArg, pagesDir, out, filter] = process.argv.slice(2);
const route = process.env.ROUTE ?? "before";
const n = Number(nArg);
const persona = app.BUILT_IN_PERSONAS[0];
const embedder = {
  id: "embed-e5",
  async embed(texts) {
    const r = await fetch(`http://127.0.0.1:${e5}/v1/embeddings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: texts }) });
    return (await r.json()).data.sort((a, b) => a.index - b.index).map((d) => Float32Array.from(d.embedding));
  },
};
async function complete(messages, maxTokens) {
  const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, temperature: 0.7, top_p: 0.9, repeat_penalty: 1.1, repeat_last_n: 64, max_tokens: maxTokens, chat_template_kwargs: { enable_thinking: false } }),
  });
  const j = await r.json();
  return j.choices[0].message.content ?? "";
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
  docs.set(name, doc);
  return doc;
}

for (const item of JSON.parse(readFileSync(join(here, "items-grounding.json"), "utf8")).filter((i) => !filter || new RegExp(filter).test(i.pdf))) {
  const doc = await load(item.pdf);
  const use = app.detectUse({ text: item.question, personaId: persona.id, personaIcon: persona.icon, hasDocuments: true });
  const plan = app.planAnswerLength({ text: item.question, use });
  const system = app.turnSystemPrompt({ familySafe: true, tier: model, photos: false, persona, chatPrompt: "", memory: [], languageHint: app.languageHint(item.question), length: plan.instruction });
  let hits = [];
  let overview = false;
  let thinPage = false;
  if (item.mode === "thin") {
    /* After: the page the turn is about (page 1 here) goes in whole, under the thin-page rule (DocumentLibrary.ask `page`). */
    if (route === "after") {
      hits = (await store.chunksOf(doc.id)).filter((c) => c.page === 1).map((chunk) => ({ chunk, score: 1, cosine: 0, bm25: 0, bm25Terms: 0 }));
      overview = true;
      thinPage = true;
    } else {
      overview = app.isAboutAttachment(item.question);
      hits = overview ? app.openingHits([await store.chunksOf(doc.id)]) : await retriever.retrieve(item.question, { docIds: [doc.id] });
    }
  }
  const p = app.buildRagPrompt({ question: item.question, hits, docs: new Map([[doc.id, doc]]), strict: false, embedderId: "embed-e5", nCtx: 4096, history: [], systemPrompt: system, citeMarkers: model !== "instant", overview, ...(thinPage ? { thinPage } : {}) });
  for (let s = 1; s <= n; s++) {
    const answer = await complete(p.messages, plan.maxTokens);
    appendFileSync(out, JSON.stringify({ route, mode: item.mode, set: item.set, pdf: item.pdf, id: item.id, model, sample: s, question: item.question, truth: item.truth, used: p.used.length, system: p.messages[0].content.slice(-600), answer }) + "\n");
    process.stdout.write(".");
  }
}
console.log(" done");
