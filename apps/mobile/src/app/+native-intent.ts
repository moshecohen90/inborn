import { isShareHandoffPath } from "@inborn/core";
import { isGgufOpenUrl } from "../vault/fileHandler";

/** The share extension's handoff URL carries no route; keep the chat screen up and let useShareTarget read the item. */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (isShareHandoffPath(path)) return "/";
  /* A model file opened with Inborn (6T, 12.10: the router read content://media/… as a route and showed "not found"):
     the screen that is up imports it through useGgufOpenHandler; a cold start lands on the usual first screen. */
  if (isGgufOpenUrl(path)) return initial ? "/" : null;
  return path;
}
