import type { Delta, StoppedBy } from "@inborn/core";

/**
 * A turn that ended with no words: null when it has some. The user's own Stop before the first token leaves no row;
 * anything else (the guard, the engine returning nothing) is a system stop with Continue, never an empty bubble.
 */
export function emptyTurn(t: { reply: string; reasoning: string; stoppedBy?: StoppedBy }): "drop" | "systemStop" | null {
  if (t.reply.trim() || t.reasoning.trim()) return null;
  return t.stoppedBy === "user" ? "drop" : "systemStop";
}

/** QA seam: the stream with every word taken out, keeping its end. */
export async function* silenced(source: AsyncIterable<Delta>): AsyncIterable<Delta> {
  for await (const d of source) if (d.done) yield { done: d.done };
}
