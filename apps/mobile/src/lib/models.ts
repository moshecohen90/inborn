import { BUNDLED_MANIFEST } from "@inborn/core";

/** Friendly model names for chips and labels (§8.2: "friendly name only, no size"), taken from the catalog so the chip never disagrees with the vault. */
const NAMES: Record<string, string> = Object.fromEntries(BUNDLED_MANIFEST.models.map((m) => [m.id, m.name.toUpperCase()]));
NAMES.null = "DEV";

export const modelLabel = (id: string): string => NAMES[id] ?? id.toUpperCase();
export const modelNames = (): Record<string, string> => ({ ...NAMES });
