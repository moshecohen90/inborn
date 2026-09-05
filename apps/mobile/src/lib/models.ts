/** Friendly model names for chips and labels (§8.2: "friendly name only, no size"); the catalog (M2) supersedes this. */
const NAMES: Record<string, string> = { instant: "FAST", null: "DEV" };

export const modelLabel = (id: string): string => NAMES[id] ?? id.toUpperCase();
export const modelNames = (): Record<string, string> => ({ ...NAMES });
