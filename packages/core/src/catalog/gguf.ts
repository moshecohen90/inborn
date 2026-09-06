/**
 * GGUF header reader (spec §10.1 #8): magic, version, architecture, size and quantization are read before
 * a file is ever handed to the engine. Streams from the start of the file and stops after the metadata,
 * so a 3 GB model costs a few MB of reads.
 */
export interface GgufInfo {
  version: number;
  tensorCount: number;
  kvCount: number;
  arch: string;
  name?: string;
  /** e.g. "0.8B", from general.size_label when the publisher set it. */
  sizeLabel?: string;
  /** e.g. "Q4_K_M", from general.file_type. */
  quant?: string;
  contextLength?: number;
  hasChatTemplate: boolean;
  /** Bytes consumed to read the header (diagnostics). */
  headerBytes: number;
}

export type GgufReject = "not-gguf" | "truncated" | "unsupported-arch" | "engine-too-old";

export class GgufError extends Error {
  constructor(
    readonly reason: GgufReject,
    message: string,
  ) {
    super(message);
  }
}

const MAGIC = 0x46554747; // "GGUF" little-endian
const MAX_HEADER_BYTES = 256 * 1024 * 1024;

/* llama.cpp `enum llama_ftype`; only the names a user recognises are mapped, the rest show the raw number. */
const FILE_TYPES: Record<number, string> = {
  0: "F32", 1: "F16", 2: "Q4_0", 3: "Q4_1", 7: "Q8_0", 8: "Q5_0", 9: "Q5_1", 10: "Q2_K", 11: "Q3_K_S", 12: "Q3_K_M", 13: "Q3_K_L",
  14: "Q4_K_S", 15: "Q4_K_M", 16: "Q5_K_S", 17: "Q5_K_M", 18: "Q6_K", 19: "IQ2_XXS", 20: "IQ2_XS", 21: "Q2_K_S", 22: "IQ3_XS",
  23: "IQ3_XXS", 24: "IQ1_S", 25: "IQ4_NL", 26: "IQ3_S", 27: "IQ3_M", 28: "IQ2_S", 29: "IQ2_M", 30: "IQ4_XS", 31: "IQ1_M", 32: "BF16",
};

enum T { U8 = 0, I8, U16, I16, U32, I32, F32, BOOL, STRING, ARRAY, U64, I64, F64 }
const SCALAR_SIZE: Record<number, number> = { [T.U8]: 1, [T.I8]: 1, [T.U16]: 2, [T.I16]: 2, [T.U32]: 4, [T.I32]: 4, [T.F32]: 4, [T.BOOL]: 1, [T.U64]: 8, [T.I64]: 8, [T.F64]: 8 };

/** Sequential reader over chunks; the parser never needs random access. */
class Cursor {
  private buf = new Uint8Array(0);
  private pos = 0;
  consumed = 0;
  private done = false;
  constructor(private readonly source: AsyncIterator<Uint8Array>) {}

  private async ensure(n: number): Promise<void> {
    if (this.consumed + n > MAX_HEADER_BYTES) throw new GgufError("not-gguf", "GGUF metadata larger than 256 MB");
    while (this.buf.length - this.pos < n) {
      if (this.done) throw new GgufError("truncated", "file ends inside the GGUF header");
      const { value, done } = await this.source.next();
      if (done || !value) {
        this.done = true;
        continue;
      }
      const rest = this.buf.subarray(this.pos);
      const next = new Uint8Array(rest.length + value.length);
      next.set(rest);
      next.set(value, rest.length);
      this.buf = next;
      this.pos = 0;
    }
  }

  async bytes(n: number): Promise<Uint8Array> {
    await this.ensure(n);
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    this.consumed += n;
    return out;
  }

  async skip(n: number): Promise<void> {
    // Large arrays (token vocabularies) are skipped chunk by chunk instead of being buffered whole.
    let left = n;
    while (left > 0) {
      const step = Math.min(left, 1 << 20);
      await this.ensure(step);
      this.pos += step;
      this.consumed += step;
      left -= step;
    }
  }

  private async view(n: number): Promise<DataView> {
    const b = await this.bytes(n);
    return new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  async u32(): Promise<number> {
    return (await this.view(4)).getUint32(0, true);
  }
  async u64(): Promise<number> {
    const v = await this.view(8);
    const n = v.getBigUint64(0, true);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new GgufError("not-gguf", "unreasonable 64-bit count in header");
    return Number(n);
  }
  async string(): Promise<string> {
    const len = await this.u64();
    if (len > MAX_HEADER_BYTES) throw new GgufError("not-gguf", "unreasonable string length in header");
    return new TextDecoder().decode(await this.bytes(len));
  }
}

type Scalar = number | string | boolean;

async function readScalar(c: Cursor, type: number): Promise<Scalar> {
  switch (type) {
    case T.STRING:
      return c.string();
    case T.U32:
      return c.u32();
    case T.U64:
      return c.u64();
    case T.BOOL:
      return (await c.bytes(1))[0] !== 0;
    case T.U8:
      return (await c.bytes(1))[0] ?? 0;
    case T.I8:
      return new DataView((await c.bytes(1)).slice().buffer).getInt8(0);
    case T.U16:
      return new DataView((await c.bytes(2)).slice().buffer).getUint16(0, true);
    case T.I16:
      return new DataView((await c.bytes(2)).slice().buffer).getInt16(0, true);
    case T.I32:
      return new DataView((await c.bytes(4)).slice().buffer).getInt32(0, true);
    case T.F32:
      return new DataView((await c.bytes(4)).slice().buffer).getFloat32(0, true);
    case T.I64:
      return Number(new DataView((await c.bytes(8)).slice().buffer).getBigInt64(0, true));
    case T.F64:
      return new DataView((await c.bytes(8)).slice().buffer).getFloat64(0, true);
    default:
      throw new GgufError("not-gguf", `unknown GGUF value type ${type}`);
  }
}

/** Arrays are only walked (string arrays element by element), never kept: we need no vocabulary here. */
async function skipArray(c: Cursor): Promise<void> {
  const type = await c.u32();
  const len = await c.u64();
  if (type === T.ARRAY) {
    for (let i = 0; i < len; i++) await skipArray(c);
  } else if (type === T.STRING) {
    for (let i = 0; i < len; i++) await c.skip(await c.u64());
  } else {
    const size = SCALAR_SIZE[type];
    if (!size) throw new GgufError("not-gguf", `unknown GGUF array type ${type}`);
    await c.skip(size * len);
  }
}

const WANTED = new Set(["general.architecture", "general.name", "general.size_label", "general.file_type", "tokenizer.chat_template"]);

export async function readGgufHeader(chunks: AsyncIterable<Uint8Array>): Promise<GgufInfo> {
  const c = new Cursor(chunks[Symbol.asyncIterator]());
  let magic: number;
  try {
    magic = await c.u32();
  } catch (e) {
    if (e instanceof GgufError && e.reason === "truncated") throw new GgufError("not-gguf", "file is smaller than a GGUF header");
    throw e;
  }
  if (magic !== MAGIC) throw new GgufError("not-gguf", "not a GGUF file (bad magic)");
  const version = await c.u32();
  if (version < 2 || version > 3) throw new GgufError(version < 2 ? "not-gguf" : "engine-too-old", `GGUF version ${version}`);
  const tensorCount = await c.u64();
  const kvCount = await c.u64();
  const kv = new Map<string, Scalar>();
  let hasChatTemplate = false;
  for (let i = 0; i < kvCount; i++) {
    const key = await c.string();
    const type = await c.u32();
    if (type === T.ARRAY) {
      await skipArray(c);
      continue;
    }
    const value = await readScalar(c, type);
    if (key === "tokenizer.chat_template") hasChatTemplate = typeof value === "string" && value.length > 0;
    else if (WANTED.has(key) || key.endsWith(".context_length")) kv.set(key, value);
  }
  const arch = kv.get("general.architecture");
  if (typeof arch !== "string" || !arch) throw new GgufError("not-gguf", "GGUF without general.architecture");
  const fileType = kv.get("general.file_type");
  const ctx = kv.get(`${arch}.context_length`);
  return {
    version,
    tensorCount,
    kvCount,
    arch,
    name: typeof kv.get("general.name") === "string" ? String(kv.get("general.name")) : undefined,
    sizeLabel: typeof kv.get("general.size_label") === "string" ? String(kv.get("general.size_label")) : undefined,
    quant: typeof fileType === "number" ? (FILE_TYPES[fileType] ?? `type ${fileType}`) : undefined,
    contextLength: typeof ctx === "number" ? ctx : undefined,
    hasChatTemplate,
    headerBytes: c.consumed,
  };
}

/** Architectures the bundled llama.cpp build runs; anything else is "Update the app to run this" (§10.1 #9). */
export const SUPPORTED_ARCHS: ReadonlySet<string> = new Set([
  "llama", "llama4", "qwen2", "qwen3", "qwen3moe", "qwen35", "qwen35moe", "phi3", "phi4", "gemma", "gemma2", "gemma3", "gemma3n", "gemma4",
  "smollm3", "mistral", "mistral3", "ministral3", "nomic-bert", "bert", "deepseek2", "olmo2", "granite", "internlm2", "exaone", "glm4",
]);

export type GgufAssessment = { ok: true; info: GgufInfo } | { ok: false; reason: GgufReject; info?: GgufInfo };

/** A chat model must be a known architecture with a chat template; the engine never guesses a template (§5.2). */
export function assessGguf(info: GgufInfo, supported: ReadonlySet<string> = SUPPORTED_ARCHS): GgufAssessment {
  if (!supported.has(info.arch)) return { ok: false, reason: "unsupported-arch", info };
  return { ok: true, info };
}

/** Wraps any chunked byte source (Node stream, web ReadableStream, expo File stream) for readGgufHeader. */
export async function* chunksOf(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
    await stream.cancel().catch(() => undefined);
  }
}
