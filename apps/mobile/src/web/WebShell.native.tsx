import type { ReactNode } from "react";

/** Phones have no web doors (spec §8.9): the shell is the children. The browser version is WebShell.tsx. */
export function WebShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
