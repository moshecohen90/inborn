import type { Message } from "../llm/types";
import type { ChatMessage, MemoryFact, Persona } from "./types";

/** Tokens kept free for the reply; generation stops there anyway (§10.5 #39: max tokens with "continue"). */
export const REPLY_RESERVE_TOKENS = 512;
/** The meter turns amber here (§8.2 S11). */
export const CONTEXT_WARN = 0.8;
/** "This chat is getting long" + "Summarize and continue" (§8.2 S11). */
export const CONTEXT_FULL = 0.92;
/** Messages kept verbatim after a summary, so the model still sees the immediate exchange. */
export const SUMMARY_KEEP_RECENT = 4;
/** Per-message overhead of the chat template (role tags, separators). */
const MESSAGE_OVERHEAD = 4;

/**
 * Cheap token estimate, calibrated for Qwen-style BPE: ~4 chars per token for Latin text, ~2 for
 * Hebrew/Arabic/Cyrillic, ~1.3 for CJK. Exact counts come back from the engine (`usage`) and recalibrate.
 */
export function estimateTokens(text: string, scale = 1): number {
  if (!text) return 0;
  let latin = 0;
  let dense = 0;
  let cjk = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x0400) latin++;
    else if ((c >= 0x3000 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff)) cjk++;
    else dense++;
  }
  return Math.ceil((latin / 4 + dense / 2 + cjk / 1.3) * scale);
}

export interface SystemPromptParts {
  persona?: Pick<Persona, "systemPrompt" | "disclaimer"> | undefined;
  /** The chat's own system prompt (§7.6), under the persona's. */
  chatPrompt?: string | undefined;
  memory?: readonly MemoryFact[] | undefined;
  /** "Answer in Hebrew" style hint (§10.5 #40). */
  languageHint?: string | undefined;
  baseline?: string | undefined;
  /** How long this one answer should be (`planAnswerLength`); it goes last, nearest the question. */
  length?: string | undefined;
}

/** Layers: safety baseline → persona → chat prompt → memory facts → language hint → answer length. Empty parts vanish. */
export function composeSystemPrompt(parts: SystemPromptParts): string {
  const blocks: string[] = [];
  if (parts.baseline) blocks.push(parts.baseline);
  if (parts.persona?.systemPrompt) blocks.push(parts.persona.systemPrompt);
  if (parts.chatPrompt?.trim()) blocks.push(parts.chatPrompt.trim());
  const facts = (parts.memory ?? []).filter((f) => f.enabled && f.content.trim());
  if (facts.length) blocks.push(`Facts about the user (they can edit these in Memory):\n${facts.map((f) => `- ${f.content.trim()}`).join("\n")}`);
  if (parts.languageHint) blocks.push(parts.languageHint);
  if (parts.length?.trim()) blocks.push(parts.length.trim());
  return blocks.join("\n\n");
}

export interface BudgetInput {
  system: string;
  summary?: string | undefined;
  /** The chat's messages, oldest first; the summary replaces everything up to and including `summaryUpTo`. */
  messages: readonly Pick<ChatMessage, "id" | "role" | "content" | "images">[];
  summaryUpTo?: string | undefined;
  nCtx: number;
  reserve?: number;
  /** Calibration factor from the last measured prompt (actual / estimated). */
  scale?: number;
}

export interface Budget {
  messages: Message[];
  /** Estimated prompt tokens of `messages`. */
  used: number;
  /** nCtx minus the reply reserve. */
  budget: number;
  /** used / nCtx, 0–1+. */
  fullness: number;
  /** Turns that did not fit and were left out (oldest first). */
  dropped: number;
}

/** Newest-first packing: the system prompt and the last turn always go in; older turns until the budget is spent. */
export function buildPrompt(input: BudgetInput): Budget {
  const scale = input.scale ?? 1;
  const reserve = input.reserve ?? REPLY_RESERVE_TOKENS;
  const budget = Math.max(0, input.nCtx - reserve);
  const cost = (m: Message) => estimateTokens(m.content, scale) + MESSAGE_OVERHEAD;
  const head: Message[] = [];
  if (input.system.trim()) head.push({ role: "system", content: input.system.trim() });
  let from = 0;
  if (input.summaryUpTo) {
    const at = input.messages.findIndex((m) => m.id === input.summaryUpTo);
    if (at >= 0) from = at + 1;
  }
  if (input.summary && from > 0) head.push({ role: "system", content: `Summary of the conversation so far:\n${input.summary.trim()}` });
  let used = head.reduce((n, m) => n + cost(m), 0);
  const tail: Message[] = [];
  const candidates = input.messages.slice(from).filter((m) => m.role !== "system");
  for (let i = candidates.length - 1; i >= 0; i--) {
    const src = candidates[i]!;
    const m: Message = { role: src.role, content: src.content, ...(src.images?.length ? { images: src.images } : {}) };
    const c = cost(m);
    if (tail.length && used + c > budget) break;
    tail.unshift(m);
    used += c;
  }
  return { messages: [...head, ...tail], used, budget, fullness: input.nCtx > 0 ? used / input.nCtx : 0, dropped: candidates.length - tail.length };
}

export type ContextLevel = "ok" | "warn" | "full";

export function contextLevel(fullness: number): ContextLevel {
  if (fullness >= CONTEXT_FULL) return "full";
  if (fullness >= CONTEXT_WARN) return "warn";
  return "ok";
}

export interface SummaryPlan {
  /** Messages to summarize (the old ones), oldest first. Empty when there is nothing worth folding. */
  toSummarize: Pick<ChatMessage, "id" | "role" | "content">[];
  /** Id of the last summarized message → becomes `chat.summaryUpTo`. */
  upTo: string | undefined;
  /** What to send to the model. */
  request: Message[];
}

/** Folds every message except the most recent `keepRecent` into one summarization request; includes the previous summary. */
export function planSummary(
  messages: readonly Pick<ChatMessage, "id" | "role" | "content">[],
  previous?: { summary: string; upTo: string } | undefined,
  keepRecent = SUMMARY_KEEP_RECENT,
): SummaryPlan {
  let from = 0;
  if (previous) {
    const at = messages.findIndex((m) => m.id === previous.upTo);
    if (at >= 0) from = at + 1;
  }
  const candidates = messages.slice(from).filter((m) => m.role === "user" || m.role === "assistant");
  const toSummarize = candidates.slice(0, Math.max(0, candidates.length - keepRecent));
  if (!toSummarize.length) return { toSummarize: [], upTo: previous?.upTo, request: [] };
  const transcript = toSummarize.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
  const request: Message[] = [
    { role: "system", content: "You summarize conversations. Write a compact summary (under 200 words) of the facts, decisions, names, numbers and open questions in the conversation, in the conversation's language. No preamble." },
    { role: "user", content: `${previous ? `Earlier summary:\n${previous.summary}\n\n` : ""}Conversation:\n${transcript}\n\nSummary:` },
  ];
  return { toSummarize, upTo: toSummarize[toSummarize.length - 1]!.id, request };
}

/** actual / estimated, clamped so one odd measurement cannot swing the meter wildly. */
export function calibrate(estimated: number, actual: number, previous = 1): number {
  if (estimated <= 0 || actual <= 0) return previous;
  const ratio = actual / estimated;
  const blended = previous * 0.5 + ratio * 0.5;
  return Math.min(3, Math.max(0.33, blended));
}
