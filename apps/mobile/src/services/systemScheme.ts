export type SystemScheme = "dark" | "light";

type ChangeHandler = (e: { matches: boolean }) => void;
/** The slice of MediaQueryList this needs; older Safari has only the addListener form. */
export type SchemeQuery = {
  readonly matches: boolean;
  addEventListener?: (type: "change", handler: ChangeHandler) => void;
  addListener?: (handler: ChangeHandler) => void;
};

/**
 * The browser's colour scheme as an external store, subscribed once for the page's lifetime (F394). The value is read
 * from the query itself, so a snapshot can never lag the OS.
 */
export function systemSchemeWatch(query: SchemeQuery) {
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };
  if (typeof query.addEventListener === "function") query.addEventListener("change", notify);
  else query.addListener?.(notify);
  return {
    get: (): SystemScheme => (query.matches ? "dark" : "light"),
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
