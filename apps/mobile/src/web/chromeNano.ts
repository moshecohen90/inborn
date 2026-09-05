import type { Capabilities, Delta, GenOpts, LoadOptions, LocalLM, Message, ModelRef, Session, Stats } from "@inborn/core";

/* The Chrome Prompt API surface this adapter uses (Chrome 138+). Typed here because no lib ships it. */
interface LanguageModelSession {
  promptStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
  destroy(): void;
  readonly inputUsage?: number;
  readonly inputQuota?: number;
}
interface LanguageModelStatic {
  availability(): Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  create(options?: { initialPrompts?: { role: string; content: string }[]; temperature?: number; topK?: number; signal?: AbortSignal }): Promise<LanguageModelSession>;
}

export const CHROME_MODEL_ID = "chrome-nano";

export function languageModel(): LanguageModelStatic | null {
  const lm = (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  return lm && typeof lm.create === "function" ? lm : null;
}

/** Shown only when the API exists; still the user has to opt in (spec §14.3 "Google's model, managed by Chrome"). */
export const chromePromptApiAvailable = (): boolean => languageModel() !== null;

/**
 * Chrome Prompt API as an optional engine. Not Inborn's model: Chrome owns the weights, the download and the terms,
 * which is why the switch is off by default and labelled as Google's. Nothing here reaches any server of ours.
 */
export class ChromeNanoLM implements LocalLM {
  readonly id = "chrome-nano" as const;
  private session: Session | null = null;
  private last: Stats = { tokPerSec: 0, ttftMs: 0, ctxUsed: 0, memMB: 0 };

  capabilities(): Capabilities {
    return { vision: false, tools: false, embeddings: false, maxContext: this.session?.nCtx ?? 4096 };
  }

  async load(model: ModelRef, opts: LoadOptions): Promise<Session> {
    const lm = languageModel();
    if (!lm) throw new Error("Chrome Prompt API not available in this browser");
    const availability = await lm.availability();
    if (availability === "unavailable") throw new Error("Chrome reports its model as unavailable on this device");
    /* create() triggers Chrome's own download when the model is only "downloadable"; that is Chrome's traffic, labelled as such. */
    const probe = await lm.create();
    probe.destroy();
    this.session = { model, nCtx: opts.nCtx };
    return this.session;
  }

  async unload(): Promise<void> {
    this.session = null;
  }

  async *generate(session: Session, messages: Message[], _opts: GenOpts, signal: AbortSignal): AsyncIterable<Delta> {
    const lm = languageModel();
    if (!lm || session !== this.session) throw new Error("model not loaded");
    const started = performance.now();
    const history = messages.slice(0, -1).filter((m) => m.role !== "tool");
    const prompt = messages[messages.length - 1]?.content ?? "";
    const chat = await lm.create({ initialPrompts: history.map((m) => ({ role: m.role, content: m.content })), signal });
    let ttft = 0;
    let text = "";
    let chunks = 0;
    try {
      const reader = chat.promptStreaming(prompt, { signal }).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        /* Early Chrome versions streamed the cumulative text; newer ones stream deltas. Handle both. */
        const delta = value.startsWith(text) && value.length > text.length ? value.slice(text.length) : value;
        text = value.startsWith(text) ? value : text + value;
        if (!delta) continue;
        if (!ttft) ttft = performance.now() - started;
        chunks++;
        yield { text: delta };
      }
    } catch (e: unknown) {
      if (!(e instanceof Error && e.name === "AbortError")) throw e;
    } finally {
      chat.destroy();
    }
    const completionTokens = Math.max(chunks, Math.round(text.length / 4));
    const tokPerSec = completionTokens ? (completionTokens * 1000) / Math.max(1, performance.now() - started - ttft) : 0;
    this.last = { tokPerSec, ttftMs: ttft, ctxUsed: chat.inputUsage ?? 0, memMB: 0 };
    yield { done: { promptTokens: Math.round(prompt.length / 4), completionTokens, ttftMs: ttft, tokPerSec } };
  }

  async embed(): Promise<Float32Array[]> {
    throw new Error("the Chrome Prompt API has no embeddings");
  }

  stats(): Stats {
    return this.last;
  }
}
