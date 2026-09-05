import { File, Paths } from "expo-file-system";
import type { Engine } from "./index";
import { resolveEngine } from "../vault/resolve";
import { getVault } from "../vault/store";

/** Headless device runs write their measurements here; read back with `devicectl device copy from` / `adb exec-out run-as … cat`. */
export const DEV_RESULT_FILE = "dev-run.json";

/** Phones: the vault resolves the default installed model (pack, download, import, or the M1 `instant.gguf` dev fallback). */
export function devModelEngine(): Engine | null {
  return resolveEngine();
}

/** Loads the vault record and scans the model files before the first createEngine(). */
export const prepareDevModel = (): Promise<void> => getVault().ready();

export function writeDevResult(result: Record<string, unknown>): void {
  new File(Paths.document, DEV_RESULT_FILE).write(JSON.stringify(result));
}
