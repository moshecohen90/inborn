/** Rank fusion (RRF) and maximal marginal relevance for the top-k (spec §5.5: k=6, MMR). */
import { cosine } from "./vector";

export interface Ranked {
  id: string;
  score: number;
}

/** Reciprocal rank fusion: Σ 1/(k + rank) over every list the id appears in. */
export function reciprocalRankFusion(lists: Ranked[][], k = 60): Ranked[] {
  const fused = new Map<string, number>();
  for (const list of lists) {
    list.forEach((r, i) => fused.set(r.id, (fused.get(r.id) ?? 0) + 1 / (k + i + 1)));
  }
  return [...fused].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export interface MmrCandidate {
  id: string;
  /** Relevance as ranked by the caller (normalized 0..1 works best). */
  relevance: number;
  vector: Float32Array;
}

/** Greedy MMR: each pick maximizes λ·relevance − (1−λ)·max similarity to what is already picked. */
export function mmr(candidates: MmrCandidate[], k: number, lambda = 0.7): MmrCandidate[] {
  const picked: MmrCandidate[] = [];
  const pool = [...candidates];
  while (picked.length < k && pool.length) {
    let bestIdx = 0;
    let best = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i]!;
      let maxSim = 0;
      for (const p of picked) maxSim = Math.max(maxSim, cosine(c.vector, p.vector));
      const s = lambda * c.relevance - (1 - lambda) * maxSim;
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    }
    picked.push(pool.splice(bestIdx, 1)[0]!);
  }
  return picked;
}
