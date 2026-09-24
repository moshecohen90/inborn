/** Embedders: the engine's embed() behind the RAG interface, the nomic prefixes, and a deterministic hash embedder for tests. */
import type { LocalLM } from "../llm/types";
import { bm25Tokens } from "./bm25";
import type { Embedder } from "./types";
import { normalize } from "./vector";

/* nomic-embed-text v1.5 is trained with task prefixes; without them retrieval quality drops noticeably. */
export const NOMIC_DOC_PREFIX = "search_document: ";
export const NOMIC_QUERY_PREFIX = "search_query: ";

/* multilingual-e5-*-instruct takes the task on the query only; a passage is embedded raw. Every number in
   docs/qa/embed-multilingual/measure.md was measured with exactly this string, so changing it invalidates them. */
export const E5_QUERY_PREFIX = "Instruct: Given a question, retrieve the passage of a document that answers it\nQuery: ";

const PREFIXES: ReadonlyArray<{ match: RegExp; doc: string; query: string }> = [
  { match: /nomic/i, doc: NOMIC_DOC_PREFIX, query: NOMIC_QUERY_PREFIX },
  { match: /e5/i, doc: "", query: E5_QUERY_PREFIX },
];

const prefixesFor = (embedderId: string) => PREFIXES.find((p) => p.match.test(embedderId));

export const usesNomicPrefixes = (embedderId: string): boolean => /nomic/i.test(embedderId);

export function forDocuments(embedderId: string, texts: string[]): string[] {
  const p = prefixesFor(embedderId);
  return p?.doc ? texts.map((t) => p.doc + t) : texts;
}

export function forQuery(embedderId: string, text: string): string {
  return (prefixesFor(embedderId)?.query ?? "") + text;
}

/** Any LocalLM whose capabilities report embeddings (llama.rn / wllama / tauri sessions loaded for embedding). */
export class LocalLMEmbedder implements Embedder {
  constructor(
    private readonly lm: LocalLM,
    readonly id: string,
  ) {}

  embed(texts: string[]): Promise<Float32Array[]> {
    return this.lm.embed(texts);
  }
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Bag-of-words hashing into `dim` buckets with a hashed sign; unit length. Same text → same vector, related text → high cosine. */
export function hashVector(text: string, dim = 64): Float32Array {
  const v = new Float32Array(dim);
  for (const t of bm25Tokens(text)) {
    const h = fnv1a(t);
    const idx = h % dim;
    const sign = (h >>> 16) & 1 ? 1 : -1;
    v[idx] = (v[idx] ?? 0) + sign;
  }
  return normalize(v);
}

export function hashEmbedder(dim = 64, id = "null"): Embedder {
  return { id, embed: async (texts) => texts.map((t) => hashVector(t, dim)) };
}

interface EmbedCall {
  texts: string[];
  out: Float32Array[];
  resolve: (v: Float32Array[]) => void;
  reject: (e: unknown) => void;
}

/**
 * One embedder, two lanes (QA F353). The engine runs one text at a time; between texts a waiting question goes before the
 * next chunk of the index queue, so it waits at most one chunk's embedding instead of a whole re-index and never reaches
 * the engine while it is busy ("Context is busy" on llama.rn). No second model is loaded.
 */
export class EmbedLanes {
  private readonly lanes: { query: EmbedCall[]; index: EmbedCall[] } = { query: [], index: [] };
  private running = false;
  /** For questions: served before any chunk still waiting in the index lane. */
  readonly query: Embedder;
  /** For indexing: yields to the query lane after every text. */
  readonly index: Embedder;

  constructor(private readonly inner: Embedder) {
    this.query = { id: inner.id, embed: (texts) => this.submit("query", texts) };
    this.index = { id: inner.id, embed: (texts) => this.submit("index", texts) };
  }

  private submit(lane: "query" | "index", texts: string[]): Promise<Float32Array[]> {
    if (!texts.length) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      this.lanes[lane].push({ texts, out: [], resolve, reject });
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let call = this.next(); call; call = this.next()) {
        try {
          const [v] = await this.inner.embed([call.texts[call.out.length]!]);
          if (!v) throw new Error("embedder returned no vector");
          call.out.push(v);
          if (call.out.length === call.texts.length) {
            this.drop(call);
            call.resolve(call.out);
          }
        } catch (e: unknown) {
          this.drop(call);
          call.reject(e);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private next(): EmbedCall | undefined {
    return this.lanes.query[0] ?? this.lanes.index[0];
  }

  private drop(call: EmbedCall): void {
    for (const lane of [this.lanes.query, this.lanes.index]) {
      const at = lane.indexOf(call);
      if (at >= 0) lane.splice(at, 1);
    }
  }
}
