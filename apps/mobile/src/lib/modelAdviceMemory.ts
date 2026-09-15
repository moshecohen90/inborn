/** Per-chat memory of the §7.8 advice card for this app run: a reason shows once, and "Not now" keeps it away for the rest of the chat. */
const byChat = new Map<string, { seen: Set<string>; dismissed: Set<string> }>();

export function adviceMemory(chatId: string): { seen: Set<string>; dismissed: Set<string> } {
  let m = byChat.get(chatId);
  if (!m) byChat.set(chatId, (m = { seen: new Set(), dismissed: new Set() }));
  return m;
}

/** Which advice key may be on screen now: a new key is shown once; a key seen before, or dismissed, stays hidden. */
export function adviceToShow(chatId: string, key: string | null, shownKey: string | null): string | null {
  if (!key) return null;
  const m = adviceMemory(chatId);
  if (m.dismissed.has(key)) return null;
  if (key === shownKey) return key;
  if (m.seen.has(key)) return null;
  m.seen.add(key);
  return key;
}

export function dismissAdvice(chatId: string, key: string): void {
  adviceMemory(chatId).dismissed.add(key);
}

export const resetAdviceMemory = (): void => byChat.clear();
