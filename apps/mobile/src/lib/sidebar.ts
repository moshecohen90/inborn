import { useSyncExternalStore } from "react";

/* The wide shell's sidebar (§8.9). It lives outside React state because the chat header has to know whether the sidebar
   is showing: with it hidden, the header's "Chats" button is the only way back to the list. */
let open = true;
const listeners = new Set<() => void>();

export function setSidebarOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const l of [...listeners]) l();
}

export const toggleSidebar = (): void => setSidebarOpen(!open);

export function useSidebarOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => open,
    () => open,
  );
}
