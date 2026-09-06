/**
 * The new-chat sheet (Chats) picks a persona before App switches to the Chat screen. App.tsx's contract only carries
 * `incognito`, so the choice is parked here and consumed once by the next empty Chat mount. The lead can replace it
 * with the optional `personaId` prop on `Chat`.
 */
let pending: { personaId?: string } | null = null;

export function setNewChatIntent(intent: { personaId?: string }): void {
  pending = intent;
}

export function takeNewChatIntent(): { personaId?: string } | null {
  const p = pending;
  pending = null;
  return p;
}
