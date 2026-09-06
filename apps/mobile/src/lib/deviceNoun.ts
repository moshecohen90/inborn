import { deviceClass } from "../device/signals";

export type DeviceNoun = "phone" | "tablet" | "computer" | "browser";

/**
 * The `{device}` argument of every "stays on this …" string (§9.9): English prints the value as is, the other locales
 * inflect it with an ICU select. Read once per launch; the class cannot change while the app runs.
 */
let cached: DeviceNoun | null = null;

export function deviceNoun(): DeviceNoun {
  return (cached ??= classify());
}

function classify(): DeviceNoun {
  switch (deviceClass()) {
    case "phone":
      return "phone";
    case "tablet":
      return "tablet";
    case "browser":
      return "browser";
    default:
      return "computer";
  }
}
