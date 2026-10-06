import { beforeAll, describe, expect, it, vi } from "vitest";

/* r134b: llama.rn's embedding() reuses the previous call's tokens as a cached prefix over an empty KV cache. */
const calls: string[] = [];
const fakeCtx = {
  clearCache: vi.fn(async (data: boolean) => void calls.push(`clear:${data}`)),
  embedding: vi.fn(async (t: string) => (calls.push(`embed:${t}`), { embedding: [t.length, 1] })),
  parallel: {
    enable: vi.fn(async (c: { n_parallel: number }) => (calls.push(`parallel:${c.n_parallel}`), true)),
    embedding: vi.fn(async (t: string) => (calls.push(`slot:${t}`), { requestId: 1, promise: Promise.resolve({ embedding: [t.length, 1] }) })),
  },
};
const initLlama = vi.fn(async (_p: Record<string, unknown>) => fakeCtx);
vi.mock("llama.rn", () => ({ initLlama }));
vi.mock("@wllama/wllama/esm/index.js", () => ({ Wllama: class {}, LoggerWithoutDebug: {}, LogLevel: {} }));
vi.mock("expo-device", () => ({ isDevice: false }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

let mod: typeof import("./llamaRn");
beforeAll(async () => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  mod = await import("./llamaRn");
}, 60_000);

describe("r134b · every llama.rn embedding starts from a cleared cache", () => {
  it("the index embedder sends every text through a fresh parallel slot, never the prefix-reusing embedding(), and carries the revision that rebuilds old indexes", async () => {
    const { LlamaRnEmbedder } = mod;
    calls.length = 0;
    const e = new LlamaRnEmbedder("embed-e5", "e5.gguf");
    const out = await e.embed(["Query: a", "Query: a", "passage"]);
    expect(initLlama.mock.calls[0]![0]).toMatchObject({ embedding: true, n_parallel: 1 });
    expect(calls).toEqual(["parallel:1", "slot:Query: a", "slot:Query: a", "slot:passage"]);
    expect(out.map((v) => v[0])).toEqual([8, 8, 7]);
    expect(e.revision).toBe(2);
  });

  it("the chat engine's embed() clears its cache (a chat model has KV memory, so clearCache resets the reused prefix there)", async () => {
    const { LlamaRnLM } = mod;
    calls.length = 0;
    const lm = new LlamaRnLM();
    Object.assign(lm as object, { ctx: fakeCtx });
    await lm.embed(["x", "y"]);
    expect(calls).toEqual(["clear:false", "embed:x", "clear:false", "embed:y"]);
  });
});
