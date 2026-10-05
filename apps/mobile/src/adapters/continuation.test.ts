import { beforeAll, describe, expect, it, vi } from "vitest";
import { CONTINUE_INSTRUCTION, type Delta, type Message, type Session } from "@inborn/core";

/* F443: with GenOpts.continueFrom both engines resume the same assistant turn; no "Continue" user turn reaches the model. */
vi.mock("@wllama/wllama/esm/index.js", () => ({ Wllama: class {}, LoggerWithoutDebug: {}, LogLevel: {} }));
vi.mock("llama.rn", () => ({ initLlama: vi.fn() }));
vi.mock("expo-device", () => ({ isDevice: false }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const session: Session = { model: { id: "fast", uri: "fast.gguf" }, nCtx: 4096 };
const QUESTION: Message = { role: "user", content: "Explain in 8 sentences how a sailing ship tacks against the wind." };
const HISTORY: Message[] = [{ role: "system", content: "You are Inborn." }, QUESTION];
const STOPPED = "To tack, the ship turns its bow through the wind. From this point, the captain ste";
const collect = async (it: AsyncIterable<Delta>) => {
  let text = "";
  let reasoning = "";
  let done: Delta["done"];
  for await (const d of it) {
    if (d.text) text += d.text;
    if (d.reasoning) reasoning += d.reasoning;
    if (d.done) done = d.done;
  }
  return { text, reasoning, done };
};
const said = (messages: { content?: unknown }[]) => messages.some((m) => JSON.stringify(m.content ?? "").includes(CONTINUE_INSTRUCTION));

beforeAll(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});

describe("F443 · wllama: llama-server continues the final assistant message", () => {
  const fakeWith = (chunks: Record<string, unknown>[]) => {
    const requests: Record<string, unknown>[] = [];
    const fake = {
      createChatCompletion: async (r: Record<string, unknown>) => {
        requests.push(r);
        return (async function* () {
          for (const c of chunks) yield c;
        })();
      },
    };
    return { fake, requests };
  };
  const chunk = (delta: Record<string, unknown>) => ({ choices: [{ delta }] });

  it("sends the partial as the last assistant message with continue_final_message, and streams only what is new", async () => {
    const { WllamaLM } = await import("./wllama");
    const lm = new WllamaLM();
    const { fake, requests } = fakeWith([chunk({ role: "assistant", content: null }), chunk({ content: "ers" }), chunk({ content: " the bow." })]);
    Object.assign(lm as object, { wllama: fake, session });
    const out = await collect(lm.generate(session, HISTORY, { continueFrom: { text: STOPPED } }, new AbortController().signal));
    const r = requests[0]!;
    const messages = r.messages as { role: string; content: unknown }[];
    expect(messages.at(-1)).toEqual({ role: "assistant", content: STOPPED });
    expect(messages.at(-2)).toEqual(QUESTION);
    expect(said(messages)).toBe(false);
    expect(r).toMatchObject({ continue_final_message: true, add_generation_prompt: false });
    expect(out.text).toBe("ers the bow.");
    expect(lm.capabilities().continuation).toBe(true);
  });

  it("the reasoning goes as reasoning_content, a trailing space is not sent", async () => {
    const { WllamaLM } = await import("./wllama");
    const lm = new WllamaLM();
    const { fake, requests } = fakeWith([chunk({ content: "steers" })]);
    Object.assign(lm as object, { wllama: fake, session });
    await collect(lm.generate(session, HISTORY, { reasoning: true, continueFrom: { text: "…into the wind. ", reasoning: "Tacking." } }, new AbortController().signal));
    const messages = requests[0]!.messages as Record<string, unknown>[];
    expect(messages.at(-1)).toEqual({ role: "assistant", content: "…into the wind.", reasoning_content: "Tacking." });
  });

  it("without continueFrom the request is unchanged: the last message is the user's, no continuation flags", async () => {
    const { WllamaLM } = await import("./wllama");
    const lm = new WllamaLM();
    const { fake, requests } = fakeWith([chunk({ content: "Hi" })]);
    Object.assign(lm as object, { wllama: fake, session });
    await collect(lm.generate(session, HISTORY, {}, new AbortController().signal));
    const r = requests[0]!;
    expect((r.messages as Message[]).at(-1)).toEqual(QUESTION);
    expect(r.continue_final_message).toBeUndefined();
    expect(r.add_generation_prompt).toBeUndefined();
  });

  it("a photo turn keeps its picture: the partial follows the user message with the image parts", async () => {
    const { WllamaLM } = await import("./wllama");
    const lm = new WllamaLM();
    const { fake, requests } = fakeWith([chunk({ content: " circle." })]);
    Object.assign(lm as object, { wllama: fake, session, vision: true });
    const photo: Message = { role: "user", content: "What is in this photo?", images: ["data:image/png;base64,iVBORw0KGgo="] };
    await collect(lm.generate(session, [HISTORY[0]!, photo], { continueFrom: { text: "It shows a red" } }, new AbortController().signal));
    const messages = requests[0]!.messages as { role: string; content: unknown }[];
    expect(messages.at(-1)).toEqual({ role: "assistant", content: "It shows a red" });
    const user = messages.at(-2)!;
    expect(Array.isArray(user.content)).toBe(true);
    expect((user.content as { type: string }[]).map((p) => p.type)).toEqual(["image", "text"]);
  });
});

describe("F443 · llama.rn: the rendered chat plus the prefill as a raw prompt", () => {
  const RENDERED_HISTORY = "<|im_start|>system\nYou are Inborn.<|im_end|>\n<|im_start|>user\nExplain in 8 sentences how a sailing ship tacks against the wind.<|im_end|>\n";
  const GEN_OFF = "<|im_start|>assistant\n<think>\n\n</think>\n\n";
  const GEN_ON = "<|im_start|>assistant\n<think>\n";
  const fakeCtx = (gen: string, stream: { content?: string; reasoning_content?: string }[], media: string[] = []) => {
    const calls: { formatted?: { messages: unknown[]; params: Record<string, unknown> }; completion?: Record<string, unknown> } = {};
    const ctx = {
      getFormattedChat: async (messages: unknown[], _t: unknown, params: Record<string, unknown>) => {
        calls.formatted = { messages, params };
        return { type: "jinja", prompt: RENDERED_HISTORY + gen, generation_prompt: gen, chat_format: 7, chat_parser: "PARSER", thinking_start_tag: "<think>", thinking_end_tag: "</think>", thinking_forced_open: gen === GEN_ON, additional_stops: ["<|im_end|>"], has_media: media.length > 0, media_paths: media };
      },
      completion: async (p: Record<string, unknown>, cb: (d: Record<string, unknown>) => void) => {
        calls.completion = p;
        for (const s of stream) cb({ token: "", accumulated_text: "x", ...s });
        const last = stream.at(-1) ?? {};
        return { ...last, timings: {}, tokens_evaluated: 90, tokens_predicted: stream.length };
      },
      stopCompletion: async () => {},
    };
    return { ctx, calls };
  };

  it("renders the history with the generation prompt, appends the prefill, and sends no messages", async () => {
    const { LlamaRnLM } = await import("./llamaRn");
    const lm = new LlamaRnLM();
    /* llama.rn parses prefill_text + generated text, so its content starts with the text on screen. */
    const { ctx, calls } = fakeCtx(GEN_OFF, [{ content: `${STOPPED}ers` }, { content: `${STOPPED}ers the bow.` }]);
    Object.assign(lm as object, { ctx, session });
    const out = await collect(lm.generate(session, HISTORY, { reasoning: false, continueFrom: { text: STOPPED } }, new AbortController().signal));
    expect(calls.formatted!.params).toMatchObject({ jinja: true, add_generation_prompt: true, enable_thinking: false, reasoning_format: "auto" });
    expect(said(calls.formatted!.messages as { content?: unknown }[])).toBe(false);
    const p = calls.completion!;
    expect(p.messages).toBeUndefined();
    expect(p.prompt).toBe(RENDERED_HISTORY + GEN_OFF + STOPPED);
    expect(p.generation_prompt).toBe("<|im_start|>assistant\n");
    expect(p.prefill_text).toBe(`<think>\n\n</think>\n\n${STOPPED}`);
    expect(p).toMatchObject({ chat_format: 7, chat_parser: "PARSER", stop: ["<|im_end|>"] });
    expect(out.text).toBe("ers the bow.");
    expect(out.done?.promptTokens).toBe(90);
    expect(lm.capabilities().continuation).toBe(true);
  });

  it("thinking on: the reasoning is closed in the prefill and not streamed again", async () => {
    const { LlamaRnLM } = await import("./llamaRn");
    const lm = new LlamaRnLM();
    const { ctx, calls } = fakeCtx(GEN_ON, [{ reasoning_content: "Tacking.", content: `${STOPPED}ers` }]);
    Object.assign(lm as object, { ctx, session });
    const out = await collect(lm.generate(session, HISTORY, { reasoning: true, continueFrom: { text: STOPPED, reasoning: "Tacking." } }, new AbortController().signal));
    expect(calls.completion!.prompt).toBe(`${RENDERED_HISTORY}<|im_start|>assistant\n<think>\nTacking.\n</think>\n\n${STOPPED}`);
    expect(out.reasoning).toBe("");
    expect(out.text).toBe("ers");
  });

  it("a photo turn keeps its picture: the image part goes to the formatter and its path to the completion", async () => {
    const { LlamaRnLM } = await import("./llamaRn");
    const lm = new LlamaRnLM();
    const { ctx, calls } = fakeCtx(GEN_OFF, [{ content: "It shows a red circle." }], ["/data/photo.jpg"]);
    Object.assign(lm as object, { ctx, session, vision: true });
    const photo: Message = { role: "user", content: "What is in this photo?", images: ["file:///data/photo.jpg"] };
    const out = await collect(lm.generate(session, [HISTORY[0]!, photo], { continueFrom: { text: "It shows a red" } }, new AbortController().signal));
    const user = (calls.formatted!.messages as { content: { type: string }[] }[]).at(-1)!;
    expect(user.content.map((p) => p.type)).toEqual(["image_url", "text"]);
    expect(calls.completion!.media_paths).toEqual(["/data/photo.jpg"]);
    expect(out.text).toBe(" circle.");
  });

  it("without continueFrom the completion still gets the messages (unchanged)", async () => {
    const { LlamaRnLM } = await import("./llamaRn");
    const lm = new LlamaRnLM();
    const { ctx, calls } = fakeCtx(GEN_OFF, [{ content: "Hi" }]);
    Object.assign(lm as object, { ctx, session });
    await collect(lm.generate(session, HISTORY, {}, new AbortController().signal));
    expect(calls.formatted).toBeUndefined();
    expect((calls.completion!.messages as Message[]).at(-1)).toEqual(QUESTION);
  });
});
