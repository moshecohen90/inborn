import { useEffect } from "react";

/* Counts the work a reload would destroy (a model download, a streaming answer); the update hand-over waits on it. */
let holds = 0;

export const updateHeld = (): boolean => holds > 0;

export function holdUpdate(): () => void {
  holds++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
  };
}

/** Holds the update hand-over while `active` is true. */
export function useUpdateHold(active: boolean): void {
  useEffect(() => (active ? holdUpdate() : undefined), [active]);
}
