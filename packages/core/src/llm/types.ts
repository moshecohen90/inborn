/** One inference interface for every platform (spec §5.2). No implementation here may touch the network. */
export type EngineId = "llama.rn" | "apple-fm" | "wllama" | "tauri" | "chrome-nano" | "null";

export interface ModelRef {
  /** Catalog id, e.g. "instant" */
  id: string;
  /** Absolute path or platform URI of the GGUF (or the built-in engine marker) */
  uri: string;
  /** Jinja chat template comes from the GGUF and is validated by the catalog; never guessed. */
  chatTemplate?: string;
}

export interface Capabilities {
  vision: boolean;
  tools: boolean;
  embeddings: boolean;
  maxContext: number;
}

export interface LoadOptions {
  nCtx: number;
  gpuLayers?: number;
  threads?: number;
}

export interface Session {
  model: ModelRef;
  nCtx: number;
}

export type Role = "system" | "user" | "assistant" | "tool";
export interface Message {
  role: Role;
  content: string;
  /** Local image files for a vision model (spec §7.1); engines without vision ignore them. */
  images?: string[];
}

export interface GenOpts {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  /** When false the model is asked not to emit reasoning tokens (Qwen "thinking" off). */
  reasoning?: boolean;
  /** Threads for this answer (device guard, spec §6.5); engines that fix threads at load apply it on the next load. */
  threads?: number;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  ttftMs: number;
  tokPerSec: number;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface Delta {
  text?: string;
  reasoning?: string;
  toolCall?: ToolCall;
  done?: Usage;
}

export interface Stats {
  tokPerSec: number;
  ttftMs: number;
  ctxUsed: number;
  memMB: number;
}

/** llama.cpp's synthetic benchmark (S31): `pp` prompt tokens processed, then `tg` tokens generated. */
export interface BenchTimings {
  promptTokPerSec: number;
  genTokPerSec: number;
}

export interface LocalLM {
  readonly id: EngineId;
  capabilities(): Capabilities;
  load(model: ModelRef, opts: LoadOptions): Promise<Session>;
  unload(): Promise<void>;
  generate(session: Session, messages: Message[], opts: GenOpts, signal: AbortSignal): AsyncIterable<Delta>;
  embed(texts: string[]): Promise<Float32Array[]>;
  stats(): Stats;
  /** Engines that can time a synthetic run (llama.rn); absent elsewhere, so S31 hides the button. */
  bench?(pp: number, tg: number): Promise<BenchTimings>;
}
