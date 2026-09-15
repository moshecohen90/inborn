/** Per-chat memory of which §7.8 advice reasons were already shown this app run; "Not now" lives on the chat row (adviceSnoozed). */
const seenByChat = new Map<string, Set<string>>();

export function adviceSeen(chatId: string): Set<string> {
  let m = seenByChat.get(chatId);
  if (!m) seenByChat.set(chatId, (m = new Set()));
  return m;
}

/** Which advice key may be on screen now: a new key is shown once; a key seen before, or snoozed on the chat, stays hidden. */
export function adviceToShow(chatId: string, key: string | null, shownKey: string | null, snoozed: readonly string[] = []): string | null {
  if (!key) return null;
  if (snoozed.includes(key)) return null;
  if (key === shownKey) return key;
  const seen = adviceSeen(chatId);
  if (seen.has(key)) return null;
  seen.add(key);
  return key;
}

export const resetAdviceMemory = (): void => seenByChat.clear();
