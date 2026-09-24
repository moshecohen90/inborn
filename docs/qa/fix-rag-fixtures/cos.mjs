// Quantized cosine exactly as packages/core/src/rag/vector.ts computes it.
import { readFileSync } from "node:fs";
const f32 = (a) => Float32Array.from(a);
const normalize = (v) => { let s = 0; for (const x of v) s += x * x; const n = Math.sqrt(s); return v.map((x) => x / n); };
const quantize = (v) => { const u = normalize(v); let m = 0; for (const x of u) m = Math.max(m, Math.abs(x)); const scale = m / 127; return { q: Int8Array.from(u, (x) => Math.round(x / scale)), scale }; };
export function cosFn(vectorsPath) {
  const V = JSON.parse(readFileSync(vectorsPath, "utf8"));
  return (textKey, qKey) => { const { q, scale } = quantize(f32(V[textKey])); const u = normalize(f32(V[qKey])); let d = 0; for (let i = 0; i < q.length; i++) d += q[i] * u[i]; return Number((d * scale).toFixed(4)); };
}
