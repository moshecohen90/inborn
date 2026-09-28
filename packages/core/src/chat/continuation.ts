import type { ContinueFrom, Message } from "../llm/types";
import { CONTINUE_INSTRUCTION } from "./loop";

/** The text the model resumes from. A trailing space would be a token it never writes before a word, so it goes; a line break stays. */
export function prefillText(text: string): string {
  return text.replace(/[ \t]+$/u, "");
}

/**
 * F443: what Continue sends. An engine that resumes the turn gets the history up to the user's question and the partial
 * answer as `continueFrom`; any other gets the round-111 request, the partial as an assistant turn and the instruction.
 */
export function continueRequest(before: Message[], partial: { content: string; reasoning?: string }, resumes: boolean): { history: Message[]; continueFrom?: ContinueFrom } {
  if (resumes) return { history: before, continueFrom: { text: partial.content, ...(partial.reasoning ? { reasoning: partial.reasoning } : {}) } };
  return { history: [...before, { role: "assistant", content: partial.content }, { role: "user", content: CONTINUE_INSTRUCTION }] };
}

export interface ThinkTags {
  start: string;
  end: string;
}

/**
 * F443, for an engine that takes a raw prompt: `rendered` is the chat template's output for the history with the
 * generation prompt, `generation` that prompt (the assistant turn's opening). With think tags the opening is rebuilt the
 * way Qwen's template writes a finished turn, `<think>\n{reasoning}\n</think>\n\n{text}` (an empty block is what it emits
 * with thinking off), or left open when the stop came while thinking. `generation` + `prefill` is the assistant turn so
 * far, which is what the engine's output parser reads.
 */
export function continuationPrompt(rendered: string, generation: string, from: ContinueFrom, tags?: ThinkTags): { prompt: string; generation: string; prefill: string } {
  const text = prefillText(from.text);
  const history = generation && rendered.endsWith(generation) ? rendered.slice(0, rendered.length - generation.length) : rendered;
  const at = tags ? generation.lastIndexOf(tags.start) : -1;
  if (!tags || at < 0) return { prompt: history + generation + text, generation, prefill: text };
  const reasoning = (from.reasoning ?? "").trim();
  const opening = generation.slice(0, at);
  const prefill = !text && reasoning ? `${tags.start}\n${prefillText(reasoning)}` : `${tags.start}\n${reasoning}\n${tags.end}\n\n${text}`;
  return { prompt: history + opening + prefill, generation: opening, prefill };
}

/**
 * An engine whose parser reports the whole turn (the prefill included) as accumulated strings: the part past `base`,
 * or "" while the parse has not reached past it.
 */
export function pastPrefill(accumulated: string, base: string): string {
  /* A parser may drop the whitespace a turn opens with. */
  const b = base.replace(/^\s+/u, "");
  if (!b) return accumulated;
  const a = accumulated.replace(/^\s+/u, "");
  if (a.startsWith(b)) return a.slice(b.length);
  return b.startsWith(a) ? "" : accumulated;
}
