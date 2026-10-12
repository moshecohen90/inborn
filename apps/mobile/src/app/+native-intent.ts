import { isShareHandoffPath } from "@inborn/core";
import { offerOpenedFile } from "../vault/fileHandler";

/** The share extension's handoff URL carries no route; keep the chat screen up and let useShareTarget read the item. */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (isShareHandoffPath(path)) return "/";
  /* A model file opened with Inborn: the model step or the vault imports it; the router shows nothing for it
     (6T, 12.10: content://media/… read as a route ended on "not found"). A cold start lands on the usual first screen. */
  if (offerOpenedFile(path)) return initial ? "/" : null;
  return path;
}
