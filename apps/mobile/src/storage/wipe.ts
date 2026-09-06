export interface WipeOptions {
  /** Also delete model files the user imported or the dev path pushed (Play-delivered packs belong to Play). */
  models: boolean;
}

export interface WipeReport {
  deletedFiles: number;
  keptModels: number;
}

/** Web (expo-sqlite cannot be bundled here, see persistent.ts): the origin's storage, and OPFS models on request. */
export async function wipe(opts: WipeOptions): Promise<WipeReport> {
  const report: WipeReport = { deletedFiles: 0, keptModels: 0 };
  try {
    globalThis.localStorage?.clear();
    globalThis.sessionStorage?.clear();
  } catch {
    /* nothing stored */
  }
  if (opts.models && typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
    const root = (await navigator.storage.getDirectory()) as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> };
    for await (const name of root.keys()) {
      await root.removeEntry(name, { recursive: true }).catch(() => undefined);
      report.deletedFiles++;
    }
  }
  return report;
}
