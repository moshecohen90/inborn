import type { InstallState } from "@inborn/core";
import { chooseWebModel, webBoot } from "../../web/boot";
import { webDeviceProfile } from "../../web/modelChoice";
import { webDoorsApply } from "../../web/doors";
import type { StepEntry } from "./modelStep";

export interface WebStepModels {
  entries: StepEntry[];
  recommendedId: string | undefined;
  ramGB: number;
}

/**
 * S02 on the browser tier, from the same list the download door and the vault read (`WebBoot.choices`), so the three
 * screens cannot disagree about what runs here or which model is recommended. Null off the browser tier — the desktop
 * shell is `Platform.OS === "web"` too, and its models come from the Rust vault, which never ran the web boot.
 */
export function webStepModels(): WebStepModels | null {
  if (!webDoorsApply()) return null;
  let boot;
  try {
    boot = webBoot();
  } catch {
    return null;
  }
  const entries: StepEntry[] = [];
  for (const choice of boot.choices) {
    if (!choice.model) continue;
    const state: InstallState = choice.installed
      ? { kind: "ready", via: "https", bytes: choice.source.bytes, path: choice.source.file, sha256: choice.source.sha256 ?? "" }
      : { kind: "not-installed" };
    entries.push({ model: choice.model, state, plan: { via: "https", host: hostOf(choice.source.url), bytes: choice.source.bytes } });
  }
  return { entries, recommendedId: boot.choices.find((c) => c.recommended)?.source.id, ramGB: webDeviceProfile(boot.gate).ramGB };
}

const hostOf = (url: string): string => {
  try {
    return new URL(url, location.origin).host;
  } catch {
    return location.host;
  }
};

/**
 * Picking another model here is the same act as picking it at the door: remember it, then hand the page over. The
 * browser holds one model, so the download itself belongs to the door, which is where the chat root sends the reader.
 */
export async function webChooseModel(id: string): Promise<void> {
  if (!(await chooseWebModel(id))) return;
  location.assign("/");
}
