import { useSyncExternalStore } from "react";

/** The chat whose answer the background grace cut, and the assistant row holding the partial text (§6.5). */
export type PausedTurn = { chatId: string; messageId: string } | null;

/** What a generation left behind: the row it kept, and whether the guard was what stopped it. */
export interface Ended {
  chatId: string;
  guardStopped: boolean;
  /** The assistant row that holds the partial text, null when nothing was kept. */
  keptId: string | null;
}

/**
 * The store after a generation ends. A cut turn takes ownership; a turn that ran to the end in the chat that owned the
 * paused one releases it. A generation in another chat leaves that chat's paused answer alone.
 */
export function afterGeneration(prev: PausedTurn, ended: Ended): PausedTurn {
  if (ended.guardStopped && ended.keptId) return { chatId: ended.chatId, messageId: ended.keptId };
  return prev?.chatId === ended.chatId ? null : prev;
}

/** True when the chat in front is the one holding the paused partial answer; a chat with no id yet never matches. */
export const ownsPausedTurn = (turn: PausedTurn, activeChatId: string | null): boolean => turn !== null && activeChatId !== null && turn.chatId === activeChatId;

let current: PausedTurn = null;
const listeners = new Set<() => void>();

/**
 * The guard's "paused" status is one app-wide latch that only Continue clears, so on its own it followed the user into
 * every later chat and sat over empty ones (QA F28). This says which turn the pause kept, so the line shows where it belongs.
 */
export function notePausedTurn(turn: PausedTurn): void {
  if (current?.chatId === turn?.chatId && current?.messageId === turn?.messageId) return;
  current = turn;
  for (const l of listeners) l();
}

export const noteGenerationEnded = (ended: Ended): void => notePausedTurn(afterGeneration(current, ended));

/** A chat that is gone cannot hold a paused answer. */
export const forgetPausedChat = (chatId: string): void => {
  if (current?.chatId === chatId) notePausedTurn(null);
};

export const getPausedTurn = (): PausedTurn => current;

export function subscribePausedTurn(l: () => void): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function usePausedTurn(): PausedTurn {
  return useSyncExternalStore(subscribePausedTurn, getPausedTurn, getPausedTurn);
}
