import { useEffect } from "react";

/** Desktop menu accelerators (spec §8.9); the same ids may later come from hardware keyboards on tablets. */
export type Shortcut = "new-chat" | "new-incognito" | "toggle-incognito" | "focus-composer" | "search" | "stop" | "open" | "continue" | "palette" | "toggle-sidebar" | "model-picker";

type Handler = (id: Shortcut) => void;
const handlers = new Set<Handler>();

/** Fan a shortcut out to every mounted subscriber (the screens decide what applies to them). */
export function emitShortcut(id: Shortcut): void {
  for (const h of [...handlers]) h(id);
}

export function onShortcut(handler: Handler): () => void {
  handlers.add(handler);
  return () => void handlers.delete(handler);
}

/** Subscribe for the lifetime of a component; `handler` may change between renders. */
export function useShortcut(id: Shortcut, handler: () => void): void {
  useEffect(() => onShortcut((fired) => fired === id && handler()), [id, handler]);
}

export const shortcutSubscribers = (): number => handlers.size;
