import { describe, expect, it } from "vitest";
import {
  LEXICAL_INDEX_ID,
  MemoryEmbeddingStore,
  Retriever,
  buildRagPrompt,
  hashEmbedder,
  indexDocument,
  isAboutAttachment,
  lexicalEmbedder,
  openingHits,
  type Chunk,
  type DocumentRecord,
  type OpenedDocument,
} from "../src";

/**
 * Round 93 (Moshe, 25.9.2026, web): "I attach a file and the model does not understand what it is." The file was
 * indexed, but "What is this file about? Quote one sentence from it." shares no word with any passage and e5 scored
 * it 0.749, under the 0.82 door, so every passage was dropped and the model was told the documents held nothing.
 */
const ABOUT: Array<[string, string]> = [
  ["en", "What is this file about? Quote one sentence from it."],
  ["en", "Summarize this document."],
  ["en", "What's in the attachment?"],
  ["de", "Worum geht es in dieser Datei? Zitiere einen Satz daraus."],
  ["de", "Fasse das Dokument zusammen."],
  ["fr", "De quoi parle ce fichier ? Cite une phrase."],
  ["fr", "Résume ce document."],
  ["es", "¿De qué trata este archivo? Cita una frase."],
  ["es", "Resume este documento."],
  ["pt-BR", "Sobre o que é este arquivo? Cite uma frase dele."],
  ["pt-BR", "Resuma este documento."],
  ["ja", "このファイルは何についてですか？一文を引用してください。"],
  ["ja", "この文書を要約して"],
  ["ko", "이 파일은 무엇에 관한 것인가요? 한 문장을 인용해 주세요."],
  ["ko", "이 문서를 요약해 줘"],
  ["zh-Hant", "這個檔案是關於什麼的？引用其中一句話。"],
  ["zh-Hant", "總結這份文件"],
];

/* A question with a subject of its own is answered by retrieval as before, never handed the file's opening. */
const FACT: Array<[string, string]> = [
  ["en", "What is the capital of France?"],
  ["en", "When was the heat pump installed?"],
  ["en", "Who won the 1998 World Cup?"],
  ["de", "Wie viele Mitarbeiter beschäftigt die Aoba Handelsgesellschaft?"],
  ["fr", "Quelle est la capitale de la France ?"],
  ["es", "¿Cuántos empleados tiene la empresa?"],
  ["pt-BR", "Qual é a capital do Brasil?"],
  ["ja", "東京の人口は？"],
  ["ko", "서울의 인구는 얼마인가요?"],
  ["zh-Hant", "台北的人口是多少？"],
];

describe("round 93 · a question about the attached file itself", () => {
  it.each(ABOUT)("%s: %s is about the attachment", (_lang, q) => {
    expect(isAboutAttachment(q)).toBe(true);
  });

  it.each(FACT)("%s: %s asks for a fact, not about the file", (_lang, q) => {
    expect(isAboutAttachment(q)).toBe(false);
  });

  const chunk = (docId: string, page: number, ord: number, text: string): Chunk => ({ id: `${docId}:${page}:${ord}`, docId, page, ord, text, start: 0, end: text.length, tokens: 20 });

  it("hands the opening of every attached file, in reading order", () => {
    const a = [chunk("a", 2, 2, "a3"), chunk("a", 1, 0, "a1"), chunk("a", 1, 1, "a2")];
    const b = [chunk("b", 1, 0, "b1"), chunk("b", 1, 1, "b2")];
    expect(openingHits([a, b], 4).map((h) => h.chunk.text)).toEqual(["a1", "b1", "a2", "b2"]);
    expect(openingHits([a], 8).map((h) => h.chunk.text)).toEqual(["a1", "a2", "a3"]);
  });

  const doc: DocumentRecord = { id: "g", name: "greenhouse-notes.txt", kind: "txt", bytes: 250, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0 };
  const passage = chunk("g", 1, 0, "The Lindqvist greenhouse is heated by a heat pump that was installed in October 2021.");
  /* What e5 measured on the web run: cosine 0.749, no shared word. */
  const measured = [{ chunk: passage, score: 1, cosine: 0.749, bm25: 0, bm25Terms: 0 }];

  it("the relevance door alone drops the passage (the bug), the overview keeps it and cites it", () => {
    const docs = new Map([["g", doc]]);
    const question = ABOUT[0]![1];
    const dropped = buildRagPrompt({ question, hits: measured, docs, strict: false, nCtx: 4096, embedderId: "embed-e5" });
    expect(dropped.used).toHaveLength(0);
    const kept = buildRagPrompt({ question, hits: openingHits([[passage]]), docs, strict: false, nCtx: 4096, embedderId: "embed-e5", overview: true });
    expect(kept.used.map((h) => h.chunk.id)).toEqual([passage.id]);
    expect(kept.citations.map((c) => c.docName)).toEqual(["greenhouse-notes.txt"]);
    expect(kept.messages.at(-1)!.content).toContain("Lindqvist greenhouse");
  });

  it("strict mode reads the opening too, instead of saying not found", () => {
    const docs = new Map([["g", doc]]);
    const kept = buildRagPrompt({ question: ABOUT[1]![1], hits: openingHits([[passage]]), docs, strict: true, nCtx: 4096, overview: true });
    expect(kept.noAnswer).toBe(false);
    expect(kept.used).toHaveLength(1);
  });
});

describe("round 93 · a file is read by its words when the index model is missing", () => {
  const opened = (pages: string[]): OpenedDocument => ({ pages: pages.length, page: async (i) => ({ page: i + 1, text: pages[i]!, needsOcr: false }), close: async () => undefined });
  const base: DocumentRecord = { id: "d", name: "notes.txt", kind: "txt", bytes: 10, pages: 0, addedAt: 0, status: "queued", indexedPages: 0, chunkCount: 0, flaggedLines: 0, ocrPages: 0 };
  const TEXT = "The irrigation timer runs twice a day, at 06:15 and at 19:40. The tomato beds are rotated with beans every second year.";

  it("indexes chunks with no vectors, marked as a word index", async () => {
    const store = new MemoryEmbeddingStore();
    const done = await indexDocument({ doc: base, opened: opened([TEXT]), embedder: null, store });
    expect(done).toMatchObject({ status: "indexed", embedModel: LEXICAL_INDEX_ID, indexedPages: 1 });
    expect(done.chunkCount).toBeGreaterThan(0);
    expect(await store.chunksOf("d")).toHaveLength(done.chunkCount);
    expect(await store.vectorsOf(["d"])).toHaveLength(0);
  });

  it("finds the passage by its words without ever calling an embedder", async () => {
    const store = new MemoryEmbeddingStore();
    await indexDocument({ doc: base, opened: opened([TEXT]), embedder: null, store });
    const hits = await new Retriever(store, lexicalEmbedder).retrieve("How often does the irrigation timer run?", { docIds: ["d"] });
    expect(hits[0]?.chunk.text).toContain("irrigation timer");
    expect(hits[0]?.bm25Terms).toBeGreaterThanOrEqual(2);
  });

  it("an index built with vectors is searched by words alone when the embedder is gone", async () => {
    const store = new MemoryEmbeddingStore();
    await indexDocument({ doc: base, opened: opened([TEXT]), embedder: hashEmbedder(32), store });
    const hits = await new Retriever(store, lexicalEmbedder).retrieve("irrigation timer beans", { docIds: ["d"], vectorPages: { d: 0 } });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.cosine).toBe(0);
  });
});
