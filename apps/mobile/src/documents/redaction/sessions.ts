import { RedactionSession } from "@inborn/core";

/**
 * One redaction session per chat key, in RAM only (spec §7.3 Work: the mapping never touches the database, so an
 * export, a backup or the model's own context never carries the originals next to their placeholders).
 */
const sessions = new Map<string, RedactionSession>();
const reveals = new Map<string, boolean>();
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version++;
  for (const l of listeners) l();
};

export function sessionFor(chatKey: string): RedactionSession {
  let s = sessions.get(chatKey);
  if (!s) {
    s = new RedactionSession();
    sessions.set(chatKey, s);
  }
  return s;
}

export const hasSession = (chatKey: string): boolean => (sessions.get(chatKey)?.size ?? 0) > 0;

/** The first message creates the chat: the draft's mapping follows it to the real id. */
export function moveSession(from: string, to: string): void {
  const s = sessions.get(from);
  if (!s) return;
  sessions.delete(from);
  if (s.size) sessions.set(to, s);
  const r = reveals.get(from);
  reveals.delete(from);
  if (r !== undefined) reveals.set(to, r);
  notify();
}

export function forgetSession(chatKey: string): void {
  const hadSession = sessions.delete(chatKey);
  const hadReveal = reveals.delete(chatKey);
  if (hadSession || hadReveal) notify();
}

export const revealing = (chatKey: string): boolean => reveals.get(chatKey) ?? false;

export function setRevealing(chatKey: string, v: boolean): void {
  reveals.set(chatKey, v);
  notify();
}

/** Called after `session.redact(...)` so subscribers re-render (the session itself is a plain object). */
export const touch = notify;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export const snapshot = (): number => version;
