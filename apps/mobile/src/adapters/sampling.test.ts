import { beforeAll, describe, expect, it, vi } from "vitest";
import { REPEAT_LAST_N, REPEAT_PENALTY, type Delta, type Session } from "@inborn/core";

/* F369: every engine adapter samples with the shared repeat penalty from @inborn/core, under the name its engine reads. */
vi.mock("@wllama/wllama/esm/index.js", () => ({ Wllama: class {}, LoggerWithoutDebug: {}, LogLevel: {} }));
vi.mock("llama.rn", () => ({ initLlama: vi.fn() }));
vi.mock("expo-device", () => ({ isDevice: false }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const session: Session = { model: { id: "instant", uri: "instant.gguf" }, nCtx: 4096 };
const drain = async (it: AsyncIterable<Delta>) => {
  for await (const _ of it) void _;
};

beforeAll(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});

describe("F369 · the shared repeat penalty reaches every engine", () => {
  it("core defaults are on (llama.cpp's own default is off)", () => {
    expect(REPEAT_PENALTY).toBeGreaterThan(1);
    expect(REPEAT_LAST_N).toBeGreaterThan(0);
  });

  it("wllama sends llama-server's repeat_penalty / repeat_last_n, which the wasm reads", async () => {
    const { WllamaLM } = await import("./wllama");
    const lm = new WllamaLM();
    let request: Record<string, unknown> = {};
    const fake = { createChatCompletion: async (r: Record<string, unknown>) => ((request = r), (async function* () {})()) };
    Object.assign(lm as object, { wllama: fake, session });
    await drain(lm.generate(session, [{ role: "user", content: "hi" }], {}, new AbortController().signal));
    expect(request).toMatchObject({ repeat_penalty: REPEAT_PENALTY, repeat_last_n: REPEAT_LAST_N, temperature: 0.7, top_p: 0.9 });
  });

  it("llama.rn sends penalty_repeat / penalty_last_n", async () => {
    const { LlamaRnLM } = await import("./llamaRn");
    const lm = new LlamaRnLM();
    let params: Record<string, unknown> = {};
    const ctx = { completion: async (p: Record<string, unknown>) => ((params = p), { content: "", timings: {} }), stopCompletion: async () => {} };
    Object.assign(lm as object, { ctx, session });
    await drain(lm.generate(session, [{ role: "user", content: "hi" }], {}, new AbortController().signal));
    expect(params).toMatchObject({ penalty_repeat: REPEAT_PENALTY, penalty_last_n: REPEAT_LAST_N, temperature: 0.7, top_p: 0.9 });
  });

  it("the desktop shell passes repeatPenalty / repeatLastN to the Rust sampler", async () => {
    let args: { opts?: Record<string, unknown> } = {};
    class Channel {
      onmessage: ((d: unknown) => void) | null = null;
    }
    const invoke = async (cmd: string, a: { opts?: Record<string, unknown>; onDelta?: Channel }) => {
      if (cmd !== "lm_generate") return undefined;
      args = a;
      a.onDelta?.onmessage?.({ done: { promptTokens: 1, completionTokens: 0, ttftMs: 0, tokPerSec: 0 } });
      return { promptTokens: 1, completionTokens: 0, ttftMs: 0, tokPerSec: 0 };
    };
    (globalThis as { window?: unknown }).window = { __TAURI__: { core: { invoke, Channel } } };
    const { TauriLM } = await import("./tauri");
    const lm = new TauriLM();
    Object.assign(lm as object, { session });
    await drain(lm.generate(session, [{ role: "user", content: "hi" }], {}, new AbortController().signal));
    expect(args.opts).toMatchObject({ repeatPenalty: REPEAT_PENALTY, repeatLastN: REPEAT_LAST_N, temperature: 0.7, topP: 0.9 });
  });

  it("a caller's own values still win", async () => {
    const { sampling } = await import("@inborn/core");
    expect(sampling({ repeatPenalty: 1, temperature: 0.3 })).toMatchObject({ repeatPenalty: 1, temperature: 0.3, repeatLastN: REPEAT_LAST_N });
  });
});
