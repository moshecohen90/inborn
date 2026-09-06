/** Embedders: the engine's embed() behind the RAG interface, the nomic prefixes, and a deterministic hash embedder for tests. */
import type { LocalLM } from "../llm/types";
import { bm25Tokens } from "./bm25";
import type { Embedder } from "./types";
import { normalize } from "./vector";

/* nomic-embed-text v1.5 is trained with task prefixes; without them retrieval quality drops noticeably. */
export const NOMIC_DOC_PREFIX = "search_document: ";
export const NOMIC_QUERY_PREFIX = "search_query: ";

export const usesNomicPrefixes = (embedderId: string): boolean => /nomic/i.test(embedderId);

export function forDocuments(embedderId: string, texts: string[]): string[] {
  return usesNomicPrefixes(embedderId) ? texts.map((t) => NOMIC_DOC_PREFIX + t) : texts;
}

export function forQuery(embedderId: string, text: string): string {
  return usesNomicPrefixes(embedderId) ? NOMIC_QUERY_PREFIX + text : text;
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
