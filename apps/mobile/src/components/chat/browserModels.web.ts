import type { UseCase } from "@inborn/core";
import { switchWebModel, webBoot, webStoredState } from "../../web/boot";
import { webDoorsApply } from "../../web/doors";
import { takeSheetReopen } from "../../web/doorReturn";
import { webLanguageUpgrade, webSheetChoices } from "../../web/modelChoice";
import type { BrowserModels } from "./browserModels";

export type { BrowserModels } from "./browserModels";

/** The browser tier's Model sheet reads `WebBoot.choices`, the list the door and the vault read (F345). */
export function browserModels(use: UseCase, languageCode: string | null, currentId: string): BrowserModels | null {
  if (!webDoorsApply()) return null;
  let boot;
  try {
    boot = webBoot();
  } catch {
    return null;
  }
  if (boot.engine === "chrome-nano") return null;
  const input = { choices: boot.choices, gate: boot.gate, use, languageCode, currentId, room: boot.room };
  return {
    choices: webSheetChoices(input),
    upgrade: webLanguageUpgrade(input),
    choose: (id) => {
      if (id === currentId) return;
      void switchWebModel(id, { to: "/", sheet: true });
    },
    stored: (id) => webStoredState(boot, id),
  };
}

/** The reader left this sheet for a model's door and took its back arrow: the chat opens with the sheet up again. */
export function reopenModelSheet(): boolean {
  return webDoorsApply() && takeSheetReopen();
}
