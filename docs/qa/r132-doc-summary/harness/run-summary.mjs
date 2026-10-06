// Questions about a whole attached file through the app's own code (Chat.tsx generate() with one PDF attached).
// ROUTE=before runs main 4aa9972a (the opening passages, or retrieval when the question is not seen as about the file);
// ROUTE=after runs round 132 (a summary reads the whole file in sections, "what is it about" is framed as the opening).
// Usage: ROUTE=before|after node run-summary.mjs <lib.mjs> <instant|fast> <chat port> <e5 port> <samples> <pages dir> <out.jsonl> [target filter]
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [libPath, model, port, e5, nArg, pagesDir, out, filter] = process.argv.slice(2);
const app = await import(resolve(libPath));
const route = process.env.ROUTE ?? "before";
const n = Number(nArg);
const N_CTX = 4096;
const persona = app.BUILT_IN_PERSONAS[0];
const embedder = {
  id: "embed-e5",
  async embed(texts) {
    const r = await fetch(`http://127.0.0.1:${e5}/v1/embeddings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: texts }) });
    const j = await r.json();
    return j.data.sort((a, b) => a.index - b.index).map((d) => Float32Array.from(d.embedding));
  },
};

const calls = [];
async function complete(messages, opts) {
  const started = Date.now();
  const s = app.sampling(opts);
  const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages,
      temperature: s.temperature,
      top_p: s.topP,
      repeat_penalty: s.repeatPenalty,
      repeat_last_n: s.repeatLastN,
      max_tokens: opts.maxTokens,
      cache_prompt: true,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  const j = await r.json();
  if (!j.choices) throw new Error(JSON.stringify(j).slice(0, 300));
  const call = { ms: Date.now() - started, promptTokens: j.usage?.prompt_tokens ?? 0, completionTokens: j.usage?.completion_tokens ?? 0, cached: j.timings?.cache_n ?? 0 };
  calls.push(call);
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

/** One fresh documents turn of generate(), returning the text the user sees. */
async function turn(doc, text) {
  const all = new Map([[doc.id, doc]]);
  const summary = route === "after" && app.fileAsk(text) === "summary";
  const use = summary ? "summarize" : app.detectUse({ text, personaId: persona.id, personaIcon: persona.icon, hasDocuments: true });
  const length = app.planAnswerLength({ text, use });
  const system = app.turnSystemPrompt({ familySafe: true, tier: model, photos: false, persona, chatPrompt: "", memory: [], languageHint: app.languageHint(text), length: length.instruction });
  const cite = model !== "instant";
  let prompt;
  let plan = null;
  let notes = null;
  const overview = app.isAboutAttachment(text);
  if (summary) {
    const files = [app.filePages(await store.chunksOf(doc.id))];
    plan = app.planWholeFile(files, { fitTokens: app.wholeFitTokens(N_CTX, system, text), pagesOf: () => doc.pages });
    notes = plan.whole ? undefined : await app.readWholeFile(plan, { complete: (m, maxTokens) => complete(m, { reasoning: false, maxTokens, temperature: 0.3 }), docs: all });
    prompt = app.wholeFilePrompt({ question: text, plan, notes, docs: all, systemPrompt: system, citeMarkers: cite });
  } else {
    const hits = overview ? app.openingHits([await store.chunksOf(doc.id)]) : await retriever.retrieve(text, { docIds: [doc.id] });
    const opening = route === "after" && overview && hits.length ? { pages: Math.max(...hits.map((h) => h.chunk.page)), of: doc.pages } : undefined;
    prompt = app.buildRagPrompt({ question: text, hits, docs: all, strict: false, embedderId: "embed-e5", nCtx: N_CTX, history: [], systemPrompt: system, citeMarkers: cite, overview, openers: app.DEFAULT_OPENERS, opening });
  }
  let answer = await complete(prompt.messages, { maxTokens: length.maxTokens, ...(persona.temperature !== undefined ? { temperature: persona.temperature } : {}) });
  if (plan && answer.trim()) answer = `${answer.trimEnd()}\n\n*${plan.pagesRead >= plan.pagesTotal ? `Summary of all ${plan.pagesTotal} pages.` : `Summary of pages 1–${plan.pagesRead} of ${plan.pagesTotal}.`}*`;
  return { answer, prompt, plan, notes, overview, summary };
}

const targets = JSON.parse(readFileSync(join(here, "targets.json"), "utf8")).filter((t) => !filter || new RegExp(filter).test(t.name));
const questions = JSON.parse(readFileSync(join(here, "questions.json"), "utf8"));
for (const target of targets) {
  const doc = await load(target.name);
  for (const q of questions) {
    for (let s = 1; s <= n; s++) {
      calls.length = 0;
      const started = Date.now();
      const t = await turn(doc, q.text);
      const ms = Date.now() - started;
      appendFileSync(
        out,
        JSON.stringify({
          route, model, target: target.name, pages: doc.pages, q: q.id, lang: q.lang, sample: s,
          answer: t.answer,
          path: t.summary ? (t.plan.whole ? "whole" : "sections") : t.overview ? "opening" : "retrieval",
          sections: t.plan?.sections.length ?? 0, pagesRead: t.plan?.pagesRead ?? null,
          notes: t.notes ?? null,
          used: t.prompt.used.length, usedPages: [...new Set(t.prompt.used.map((h) => h.chunk.page))],
          ms, calls: [...calls],
          promptTokens: calls.reduce((a, c) => a + c.promptTokens, 0), completionTokens: calls.reduce((a, c) => a + c.completionTokens, 0),
          system: t.prompt.messages[0]?.content,
        }) + "\n",
      );
      process.stdout.write(".");
    }
  }
}
console.log(" done");
