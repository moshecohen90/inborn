/**
 * Vector side of hybrid retrieval: unit vectors quantized to int8 with one scale each, brute-force cosine.
 * A 200-page document is ~800 chunks × 768 dims = 0.6 MB as int8; scanning it is well under a millisecond
 * on a phone, so no ANN structure (and no sqlite-vec) is needed at this scale.
 */
import type { StoredVector } from "./types";

export function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const n = Math.sqrt(sum);
  if (!n) return new Float32Array(v.length);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / n;
  return out;
}

export function quantize(v: Float32Array): { q: Int8Array; scale: number } {
  const unit = normalize(v);
  let max = 0;
  for (let i = 0; i < unit.length; i++) max = Math.max(max, Math.abs(unit[i]!));
  const scale = max ? max / 127 : 1;
  const q = new Int8Array(unit.length);
  for (let i = 0; i < unit.length; i++) q[i] = Math.round(unit[i]! / scale);
  return { q, scale };
}

export function dequantize(q: Int8Array, scale: number): Float32Array {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i]! * scale;
  return out;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Cosine of a quantized unit vector against a unit query: scale × Σ q_i·query_i. */
export function cosineQuantized(q: Int8Array, scale: number, unitQuery: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < q.length; i++) dot += q[i]! * unitQuery[i]!;
  return dot * scale;
}

export interface VectorHit {
  id: string;
  score: number;
}

export class VectorIndex {
  private readonly entries = new Map<string, StoredVector>();
  private dim = 0;

  get size(): number {
    return this.entries.size;
  }

  get dimension(): number {
    return this.dim;
  }

  add(chunkId: string, docId: string, vector: Float32Array): void {
    const { q, scale } = quantize(vector);
    this.addStored({ chunkId, docId, dim: vector.length, scale, q });
  }

  addStored(v: StoredVector): void {
    if (this.dim && v.dim !== this.dim) throw new Error(`vector dimension ${v.dim} does not match index dimension ${this.dim}`);
    this.dim = v.dim;
    this.entries.set(v.chunkId, v);
  }

  remove(chunkId: string): void {
    this.entries.delete(chunkId);
  }

  get(chunkId: string): StoredVector | undefined {
    return this.entries.get(chunkId);
  }

  search(query: Float32Array, k = 10, filter?: (docId: string) => boolean): VectorHit[] {
    if (!this.entries.size) return [];
    if (query.length !== this.dim) throw new Error(`query dimension ${query.length} does not match index dimension ${this.dim}`);
    const unit = normalize(query);
    const hits: VectorHit[] = [];
    for (const v of this.entries.values()) {
      if (filter && !filter(v.docId)) continue;
      hits.push({ id: v.chunkId, score: cosineQuantized(v.q, v.scale, unit) });
    }
    hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return hits.slice(0, k);
  }
}
