import { describe, expect, it } from "vitest";
import * as core from "../src/index";
import type { Delta, GenOpts, GuardedDelta, Message } from "../src/index";

/**
 * Round 121 (F443). The web, Fast, 28.9: Continue after Stop was a new user turn ("Continue exactly where you stopped…"),
 * and a 2B model answered it as a new question: "…the captain ste The ship then shifts…", "…by about 45 By swinging…".
 * Continue now resumes the same assistant turn with the partial answer as the prefill, and no user turn is sent.
 */
const { CONTINUE_INSTRUCTION, guardLoops } = core;
const usage = { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 };

const QUESTION: Message = { role: "user", content: "Explain in 8 sentences how a sailing ship tacks against the wind." };
const BEFORE: Message[] = [{ role: "system", content: "You are Inborn." }, QUESTION];
const STOPPED = "To tack, the ship turns its bow through the wind. From this point, the captain ste";

describe("F443 · Continue resumes the same answer", () => {
  it("an engine that resumes gets the history up to the question and the partial as continueFrom, no Continue turn", () => {
    const req = core.continueRequest(BEFORE, { content: STOPPED }, true);
    expect(req.history).toEqual(BEFORE);
    expect(req.history.at(-1)).toEqual(QUESTION);
    expect(req.history.some((m) => m.content === CONTINUE_INSTRUCTION)).toBe(false);
    expect(req.continueFrom).toEqual({ text: STOPPED });
  });

  it("the reasoning the answer was written after travels with it", () => {
    const req = core.continueRequest(BEFORE, { content: STOPPED, reasoning: "Tacking: bow through the wind." }, true);
    expect(req.continueFrom).toEqual({ text: STOPPED, reasoning: "Tacking: bow through the wind." });
  });

  it("an engine that cannot resume keeps the round-111 request: the partial, then the instruction as a user turn", () => {
    const req = core.continueRequest(BEFORE, { content: STOPPED }, false);
    expect(req.continueFrom).toBeUndefined();
    expect(req.history).toEqual([...BEFORE, { role: "assistant", content: STOPPED }, { role: "user", content: CONTINUE_INSTRUCTION }]);
  });

  it("GenOpts carries continueFrom", () => {
    const opts: GenOpts = { maxTokens: 64, continueFrom: { text: STOPPED, reasoning: "r" } };
    expect(opts.continueFrom?.text).toBe(STOPPED);
  });

  it("the prefill ends where the model stopped: a trailing space goes, a line break stays", () => {
    expect(core.prefillText("…the captain ste")).toBe("…the captain ste");
    expect(core.prefillText("…into the wind. ")).toBe("…into the wind.");
    expect(core.prefillText("1. Paris\n")).toBe("1. Paris\n");
  });
});

/* Qwen3.5-2B's own template (tokenizer.chat_template of Qwen3.5-2B-Q4_K_M.gguf): the generation prompt it renders. */
const HISTORY = "<|im_start|>system\nYou are Inborn.<|im_end|>\n<|im_start|>user\nExplain tacking.<|im_end|>\n";
const GEN_OFF = "<|im_start|>assistant\n<think>\n\n</think>\n\n";
const GEN_ON = "<|im_start|>assistant\n<think>\n";
const TAGS = { start: "<think>", end: "</think>" };

describe("F443 · the prefill string (the raw-prompt engine, llama.rn)", () => {
  it("thinking off: the template's empty think block, then the text; the prompt is exactly rendered + text", () => {
    const r = core.continuationPrompt(HISTORY + GEN_OFF, GEN_OFF, { text: STOPPED }, TAGS);
    expect(r.prompt).toBe(HISTORY + GEN_OFF + STOPPED);
    expect(r.generation).toBe("<|im_start|>assistant\n");
    expect(r.prefill).toBe(`<think>\n\n</think>\n\n${STOPPED}`);
    expect(r.generation + r.prefill).toBe(GEN_OFF + STOPPED);
  });

  it("thinking on: the reasoning closed as the template writes a finished turn, then the text", () => {
    const r = core.continuationPrompt(HISTORY + GEN_ON, GEN_ON, { text: STOPPED, reasoning: "\nTacking: bow through the wind.\n" }, TAGS);
    expect(r.prompt).toBe(`${HISTORY}<|im_start|>assistant\n<think>\nTacking: bow through the wind.\n</think>\n\n${STOPPED}`);
    expect(r.prefill).toBe(`<think>\nTacking: bow through the wind.\n</think>\n\n${STOPPED}`);
  });

  it("reasoning kept when thinking is off now: the empty block is replaced, not doubled", () => {
    const r = core.continuationPrompt(HISTORY + GEN_OFF, GEN_OFF, { text: STOPPED, reasoning: "R" }, TAGS);
    expect(r.prompt).toBe(`${HISTORY}<|im_start|>assistant\n<think>\nR\n</think>\n\n${STOPPED}`);
    expect(r.prompt.match(/<think>/gu)).toHaveLength(1);
  });

  it("stopped while thinking: the reasoning stays open and goes on", () => {
    const r = core.continuationPrompt(HISTORY + GEN_ON, GEN_ON, { text: "", reasoning: "\nThe user asks about tacking. First, " }, TAGS);
    expect(r.prompt).toBe(`${HISTORY}<|im_start|>assistant\n<think>\nThe user asks about tacking. First,`);
    expect(r.prompt.includes("</think>")).toBe(false);
  });

  it("a template without think tags (Phi-4-mini): the generation prompt, then the text", () => {
    const gen = "<|assistant|>";
    const r = core.continuationPrompt(`<|user|>Explain tacking.<|end|>${gen}`, gen, { text: STOPPED, reasoning: "ignored" });
    expect(r.prompt).toBe(`<|user|>Explain tacking.<|end|><|assistant|>${STOPPED}`);
    expect(r.generation).toBe(gen);
    expect(r.prefill).toBe(STOPPED);
  });

  it("a trailing space is not sent", () => {
    const r = core.continuationPrompt(HISTORY + GEN_OFF, GEN_OFF, { text: "…into the wind. " }, TAGS);
    expect(r.prompt.endsWith("into the wind.")).toBe(true);
  });
});

function engine(text: string, step = 3): AsyncIterable<Delta> {
  return (async function* () {
    const cps = Array.from(text);
    for (let i = 0; i < cps.length; i += step) yield { text: cps.slice(i, i + step).join("") };
    yield { done: usage };
  })();
}

/** Chat.tsx with continueFrom: the joint is empty, because the engine wrote the rest of the same text. */
async function resumed(prefix: string, next: string) {
  let head = prefix;
  let reply = "";
  const stream: AsyncIterable<GuardedDelta> = guardLoops(engine(next), () => {}, { prefix, request: QUESTION.content });
  for await (const d of stream) {
    if (d.prefix !== undefined) head = d.prefix;
    if (d.trim !== undefined) reply = d.trim;
    if (d.text) reply += d.text;
  }
  return head + reply;
}

describe("F443 · the seam rules stay a safety net and leave a true continuation alone", () => {
  const joins: [string, string, string][] = [
    ["…From this point, the captain ste", "ers the bow across the wind.", "…From this point, the captain steers the bow across the wind."],
    ["…the helmsman pushes the hel", "m hard over.", "…the helmsman pushes the helm hard over."],
    ["…to head downwind by about 45", " degrees before turning back.", "…to head downwind by about 45 degrees before turning back."],
    ["…when sliding down stairs", ", the boat keeps its speed.", "…when sliding down stairs, the boat keeps its speed."],
    ["…This maneuver creates", " a diagonal path.", "…This maneuver creates a diagonal path."],
    ["…from behind. As the", " wind fills the sail, the boat accelerates.", "…from behind. As the wind fills the sail, the boat accelerates."],
    ["1. Paris\n2. Ber", "lin\n3. Rome\n", "1. Paris\n2. Berlin\n3. Rome\n"],
  ];
  for (const [prefix, next, want] of joins) {
    it(`${JSON.stringify(prefix.slice(-12))} + ${JSON.stringify(next.slice(0, 12))}`, async () => {
      expect(await resumed(prefix, next)).toBe(want);
    });
  }
});
