/**
 * One boot per storage generation for the whole process. A provider mounted again while a boot runs (the router resets
 * the root after Delete everything) joins that boot instead of opening a second database beside it (F419).
 */
export interface BootGate<T> {
  /** The boot of the current storage generation: started by the first caller, shared by every later one. */
  run(start: () => Promise<T>): Promise<T>;
  /** Delete everything made a new database: the next boot opens it rather than handing back the closed store. */
  next(): void;
}

export function createBootGate<T>(): BootGate<T> {
  let generation = 0;
  let current: { generation: number; boot: Promise<T> } | null = null;
  return {
    run(start) {
      if (current?.generation === generation) return current.boot;
      const entry = { generation, boot: start() };
      current = entry;
      /* A failed boot is not kept: the next mount tries again. */
      entry.boot.catch(() => {
        if (current === entry) current = null;
      });
      return entry.boot;
    },
    next() {
      generation++;
    },
  };
}
