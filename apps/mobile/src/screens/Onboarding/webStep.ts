import { webBoot } from "../../web/boot";
import { webDoorsApply } from "../../web/doors";

export { WebModelStep } from "../../web/ModelStep";

/**
 * True on the browser tier, where S02 is the model offer itself (`WebBoot.choices`, the same list the vault and the
 * chat's Model sheet read). False off it — the desktop shell is `Platform.OS === "web"` too, and its models come from
 * the Rust vault, which never ran the web boot.
 */
export function webStepActive(): boolean {
  if (!webDoorsApply()) return false;
  try {
    webBoot();
    return true;
  } catch {
    return false;
  }
}
