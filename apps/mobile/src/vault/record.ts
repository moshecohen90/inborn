import { Platform } from "react-native";
import type { DownloadPauseState } from "expo-file-system";
import type { CatalogModel, DeliverySource } from "@inborn/core";
import { recordFile } from "./paths";

/** One installed file the vault knows about (catalog model or import). */
export interface InstalledRecord {
  file: string;
  bytes: number;
  sha256: string;
  via: DeliverySource;
  installedAt: number;
  lastLoadedAt?: number;
  /** Set before a load and cleared after success; still set at boot = the last load crashed (§10.1 #8). */
  loading?: boolean;
  quarantined?: boolean;
  /** Bundled copies are hashed once, in the background after the first launch; the result stays here (§5.4). */
  verifiedAt?: number;
}

/** An import the catalog does not know: the header fields the vault read itself. */
export interface ImportedModel {
  id: string;
  name: string;
  file: string;
  bytes: number;
  sha256: string;
  arch: string;
  sizeLabel?: string;
  quant?: string;
  contextLength?: number;
  importedAt: number;
}

export interface VaultRecord {
  version: 1;
  defaultModelId?: string;
  installs: Record<string, InstalledRecord>;
  imports: Record<string, ImportedModel>;
  /** Files picked in the Hugging Face search (§7.2), kept in catalog shape so install/verify/list treat them as catalog models. */
  hf: Record<string, CatalogModel>;
  /** Paused HTTPS downloads that survive a restart (expo-file-system savable state). */
  downloads: Record<string, DownloadPauseState & { etag?: string }>;
}

export const EMPTY_RECORD: VaultRecord = { version: 1, installs: {}, imports: {}, hf: {}, downloads: {} };

/* expo-file-system has no web implementation; the browser tier keeps its model in OPFS (src/web) and the vault stays empty. */
const noFiles = (): boolean => Platform.OS === "web";

export function readRecord(): VaultRecord {
  if (noFiles()) return { ...EMPTY_RECORD };
  try {
    const f = recordFile();
    if (!f.exists) return { ...EMPTY_RECORD };
    const parsed = JSON.parse(f.textSync()) as Partial<VaultRecord>;
    return { ...EMPTY_RECORD, ...parsed, installs: parsed.installs ?? {}, imports: parsed.imports ?? {}, hf: parsed.hf ?? {}, downloads: parsed.downloads ?? {} };
  } catch (e: unknown) {
    console.warn("[vault] record unreadable, starting empty", e);
    return { ...EMPTY_RECORD };
  }
}

export function writeRecord(record: VaultRecord): void {
  if (noFiles()) return;
  try {
    recordFile().write(JSON.stringify(record));
  } catch (e: unknown) {
    console.warn("[vault] record not written", e);
  }
}
