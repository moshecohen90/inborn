import { useEffect, useRef } from "react";

const open = new Set<() => void>();

/** Every visible sheet or modal registers its close handler so a share target (§7.7) can clear the screen before it pops to the chat. */
export function useOpenSheet(visible: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!visible) return;
    const fn = () => close.current();
    open.add(fn);
    return () => {
      open.delete(fn);
    };
  }, [visible]);
}

/* iOS never presents a Modal while another is still up, and react-native-screens keeps a popped screen until its sheet is gone. */
export function closeOpenSheets(): number {
  const all = [...open];
  for (const fn of all) fn();
  return all.length;
}
