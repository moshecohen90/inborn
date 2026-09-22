/**
 * Paths dropped on the desktop window wait here while the shell brings the documents screen up (§8.9, gap 30).
 * The same hand-off shape as lib/pausedTurn: a tiny store the screen drains once, so nothing is imported twice.
 */
let queued: string[] = [];
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const l of listeners) l();
};

export function queueDroppedPaths(paths: readonly string[]): void {
  const fresh = paths.filter((p) => !queued.includes(p));
  if (!fresh.length) return;
  queued = [...queued, ...fresh];
  notify();
}

/** Hands the queue over and empties it; a second call gets nothing. */
export function takeDroppedPaths(): string[] {
  if (!queued.length) return [];
  const taken = queued;
  queued = [];
  notify();
  return taken;
}

export const droppedPaths = (): readonly string[] => queued;

export function subscribeDroppedPaths(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
