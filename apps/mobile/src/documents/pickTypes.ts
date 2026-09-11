import types from "./pickTypes.json";

/** Document MIME types the app imports (spec §7.3): the system picker's filter and, on Android, the ACTION_SEND filter of the share target (§7.7). JSON so app.config.ts can require it at prebuild without a TS loader. */
export const PICK_TYPES: string[] = types;
