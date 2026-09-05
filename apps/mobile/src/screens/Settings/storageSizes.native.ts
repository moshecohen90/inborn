import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { DB_NAME } from "../../storage/schema";
import { getPackPath } from "../../../modules/asset-packs";

/* Same pack name as devModel.native.ts / app.config.ts; the type-level devModel.ts does not export it. */
const MODEL_PACK = "inborn_model";

export interface StorageSizes {
  chats: number | null;
  documents: number;
  models: number | null;
  memory: number;
  reports: number;
}

const sizeOf = (f: File) => (f.exists ? (f.size ?? 0) : 0);

function ggufBytes(dir: Directory | null): number {
  if (!dir || !dir.exists) return 0;
  let n = 0;
  for (const e of dir.list()) if (e instanceof File && /\.gguf$/i.test(e.name)) n += e.size ?? 0;
  return n;
}

export async function storageSizes(): Promise<StorageSizes> {
  const dbDir = new Directory(SQLite.defaultDatabaseDirectory);
  const chats = sizeOf(new File(dbDir, DB_NAME)) + sizeOf(new File(dbDir, `${DB_NAME}-wal`));
  const packDir = Platform.OS === "android" ? getPackPath(MODEL_PACK) : null;
  const models = ggufBytes(new Directory(Paths.document)) + ggufBytes(packDir ? new Directory(`file://${packDir}`) : null);
  return { chats, documents: 0, models, memory: 0, reports: 0 };
}
