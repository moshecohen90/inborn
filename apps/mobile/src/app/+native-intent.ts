import { isShareHandoffPath } from "@inborn/core";
import { offerOpenedFile } from "../vault/fileHandler";

/** The share extension's handoff URL carries no route; keep the chat screen up and let useShareTarget read the item. */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (isShareHandoffPath(path)) return "/";
  /* A model file opened with Inborn is never a route (6T, 12.10: content://media/… ended on "not found"). The model step
     or the vault takes it; with neither up (chat, warm) the vault opens on it; a cold start lands on the usual first screen. */
  const offered = offerOpenedFile(path);
  if (offered === "taken") return null;
  if (offered === "held") return initial ? "/" : "/vault";
  return path;
}
