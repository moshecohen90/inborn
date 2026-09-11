import { isShareHandoffPath } from "@inborn/core";

/** The share extension's handoff URL carries no route; keep the chat screen up and let useShareTarget read the item. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return isShareHandoffPath(path) ? "/" : path;
}
