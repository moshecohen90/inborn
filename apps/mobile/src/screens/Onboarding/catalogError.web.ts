import { webBoot } from "../../web/boot";

/** True when the browser's catalog could not be read, so the step must not say the browser has no model (B1, 24.9.2026). */
export function catalogFailed(): boolean {
  try {
    return !!webBoot().catalogError && !webBoot().source;
  } catch {
    /* The desktop shell renders these screens without the web boot; it has a vault instead of a catalog. */
    return false;
  }
}
