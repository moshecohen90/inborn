import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import { Directory, File, Paths } from "expo-file-system";
import { DB_NAME } from "./schema";
import { wipeSecureItems } from "./secureItems";

export interface WipeOptions {
  /** Also delete model files the user imported or the dev path pushed (Play-delivered packs belong to Play). */
  models: boolean;
}

export interface WipeReport {
  deletedFiles: number;
  keptModels: number;
}

const isModel = (name: string) => /\.gguf$/i.test(name);

/** Emergency wipe (spec §5.7): encrypted DB, every Keychain item (key, passcode) and every file in the app's documents; no recovery. */
export async function wipe(opts: WipeOptions): Promise<WipeReport> {
  const report: WipeReport = { deletedFiles: 0, keptModels: 0 };
  await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => undefined);
  await wipeSecureItems((item) => SecureStore.deleteItemAsync(item, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }));
  for (const dir of [new Directory(Paths.document), new Directory(Paths.cache)]) {
    if (!dir.exists) continue;
    for (const entry of dir.list()) {
      const name = entry.name;
      if (!opts.models && isModel(name)) {
        report.keptModels++;
        continue;
      }
      // The SQLite directory holds the database we just deleted plus its WAL/SHM; nothing else lives there.
      try {
        if (entry instanceof File) entry.delete();
        else if (entry instanceof Directory) entry.delete();
        report.deletedFiles++;
      } catch {
        /* a file held open by the OS; the next launch retries nothing, it is already unreadable without the key */
      }
    }
  }
  return report;
}
