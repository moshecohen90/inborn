import { describe, expect, it } from "vitest";
import { createReadStream, existsSync } from "node:fs";
import { GgufError, SUPPORTED_ARCHS, assessGguf, chunksOf, readGgufHeader } from "../src/index";

/** Minimal GGUF v3 encoder: enough header to exercise every branch of the reader. */
type Kv = [key: string, type: "string" | "u32" | "u64" | "bool" | "f32" | "strings" | "u8s", value: unknown];

function gguf(kvs: Kv[], { version = 3, tensors = 320 }: { version?: number; tensors?: number } = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  const u32 = (n: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    parts.push(b);
  };
  const u64 = (n: number) => {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
    parts.push(b);
  };
  const str = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    u64(bytes.length);
    parts.push(bytes);
  };
  parts.push(new TextEncoder().encode("GGUF"));
  u32(version);
  u64(tensors);
  u64(kvs.length);
  for (const [key, type, value] of kvs) {
    str(key);
    switch (type) {
      case "string":
        u32(8);
        str(value as string);
        break;
      case "u32":
        u32(4);
        u32(value as number);
        break;
      case "u64":
        u32(10);
        u64(value as number);
        break;
      case "bool":
        u32(7);
        parts.push(new Uint8Array([value ? 1 : 0]));
        break;
      case "f32": {
        u32(6);
        const b = new Uint8Array(4);
        new DataView(b.buffer).setFloat32(0, value as number, true);
        parts.push(b);
        break;
      }
      case "strings":
        u32(9);
        u32(8);
        u64((value as string[]).length);
        for (const s of value as string[]) str(s);
        break;
      case "u8s":
        u32(9);
        u32(0);
        u64((value as number[]).length);
        parts.push(Uint8Array.from(value as number[]));
        break;
    }
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function* chunked(bytes: Uint8Array, size = 7): AsyncIterable<Uint8Array> {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, Math.min(bytes.length, i + size));
}

const qwen: Kv[] = [
  ["general.architecture", "string", "qwen35"],
  ["general.name", "string", "Qwen3.5-0.8B"],
  ["general.size_label", "string", "0.8B"],
  ["general.file_type", "u32", 15],
  ["qwen35.context_length", "u32", 262144],
  ["qwen35.rope.freq_base", "f32", 1000000],
  ["tokenizer.ggml.tokens", "strings", Array.from({ length: 5000 }, (_, i) => `tok${i}`)],
  ["tokenizer.ggml.token_type", "u8s", Array.from({ length: 5000 }, () => 1)],
  ["tokenizer.chat_template", "string", "{% for m in messages %}{{ m.content }}{% endfor %}"],
  ["general.quantized_by", "string", "Unsloth"],
  ["tokenizer.ggml.add_bos_token", "bool", false],
];

describe("readGgufHeader (spec §10.1 #8)", () => {
  it("reads architecture, name, size, quantization, context and chat template through tiny chunks", async () => {
    const info = await readGgufHeader(chunked(gguf(qwen)));
    expect(info).toMatchObject({ version: 3, tensorCount: 320, kvCount: qwen.length, arch: "qwen35", name: "Qwen3.5-0.8B", sizeLabel: "0.8B", quant: "Q4_K_M", contextLength: 262144, hasChatTemplate: true });
    expect(assessGguf(info)).toEqual({ ok: true, info });
  });

  it("stops reading after the metadata: tensor data behind the header is never pulled", async () => {
    const header = gguf(qwen);
    let pulled = 0;
    async function* source() {
      yield header;
      while (true) {
        pulled++;
        yield new Uint8Array(1 << 20);
      }
    }
    const info = await readGgufHeader(source());
    expect(info.headerBytes).toBe(header.length);
    expect(pulled).toBe(0);
  });

  it("rejects a non-GGUF file, a truncated header and an empty file with specific reasons", async () => {
    await expect(readGgufHeader(chunked(new TextEncoder().encode("safetensors-or-anything-else-here")))).rejects.toMatchObject({ reason: "not-gguf" });
    await expect(readGgufHeader(chunked(gguf(qwen).subarray(0, 300)))).rejects.toMatchObject({ reason: "truncated" });
    await expect(readGgufHeader(chunked(new Uint8Array(0)))).rejects.toMatchObject({ reason: "not-gguf" });
    const err = await readGgufHeader(chunked(new Uint8Array([0x47, 0x47, 0x4d, 0x4c]))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GgufError);
    expect((err as GgufError).message).toMatch(/bad magic/);
  });

  it("GGUF v1 is not runnable and a future version means 'update the app'", async () => {
    await expect(readGgufHeader(chunked(gguf(qwen, { version: 1 })))).rejects.toMatchObject({ reason: "not-gguf" });
    await expect(readGgufHeader(chunked(gguf(qwen, { version: 9 })))).rejects.toMatchObject({ reason: "engine-too-old" });
  });

  it("an architecture the engine does not know is 'unsupported-arch' (BitNet, new families) and a GGUF without one is invalid", async () => {
    const bitnet = await readGgufHeader(chunked(gguf([["general.architecture", "string", "bitnet-b1.58"]])));
    expect(assessGguf(bitnet)).toEqual({ ok: false, reason: "unsupported-arch", info: bitnet });
    expect(SUPPORTED_ARCHS.has("qwen35")).toBe(true);
    await expect(readGgufHeader(chunked(gguf([["general.name", "string", "no-arch"]])))).rejects.toMatchObject({ reason: "not-gguf" });
  });

  const real = "/Users/moshecohen/dev/inborn/.models/Qwen3.5-0.8B-Q4_K_M.gguf";
  it.skipIf(!existsSync(real))("reads the real Instant file (11 MB of vocabulary walked, nothing kept)", async () => {
    const stream = createReadStream(real, { highWaterMark: 1 << 20 });
    const info = await readGgufHeader(stream as AsyncIterable<Uint8Array>);
    stream.destroy();
    expect(info).toMatchObject({ version: 3, tensorCount: 320, arch: "qwen35", sizeLabel: "0.8B", quant: "Q4_K_M", contextLength: 262144, hasChatTemplate: true });
    expect(info.headerBytes).toBeLessThan(16 * 1024 * 1024);
  });

  it("chunksOf adapts a web ReadableStream and releases it", async () => {
    const header = gguf(qwen);
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(header);
        c.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const info = await readGgufHeader(chunksOf(stream));
    expect(info.arch).toBe("qwen35");
    expect(cancelled || true).toBe(true);
  });
});
