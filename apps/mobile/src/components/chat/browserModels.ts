import type { LanguageUpgrade, UseCase } from "@inborn/core";
import type { WebSheetChoices } from "../../web/modelChoice";
import type { StoredState } from "../../web/storedModels";

export interface BrowserModels {
  choices: WebSheetChoices;
  /** What the chat's weak-language notice offers, among the models this browser runs. */
  upgrade: LanguageUpgrade | null;
  /** Remembers the pick and hands the page to the door, which delivers it (the engine is chosen once per page load). */
  choose: (id: string) => void;
  /** Each row's line from the OPFS walk, the one the vault prints: in use, installed, or the size to download. */
  stored: (id: string) => StoredState;
}

/** Phones and the desktop shell never leave the chat for a door, so there is no sheet to reopen. */
export function reopenModelSheet(): boolean {
  return false;
}

/** Type-level default: phones and the desktop shell have a vault; only the browser tier (browserModels.web.ts) answers. */
export function browserModels(_use: UseCase, _languageCode: string | null, _currentId: string): BrowserModels | null {
  return null;
}
