export interface StorageSizes {
  chats: number | null;
  documents: number;
  models: number | null;
  memory: number;
  reports: number;
}

/** Web: the browser reports one number for the origin, and it is almost entirely the cached model; chats never touch disk here. */
export async function storageSizes(): Promise<StorageSizes> {
  let usage: number | null;
  try {
    usage = (await navigator.storage?.estimate())?.usage ?? null;
  } catch {
    usage = null;
  }
  return { chats: 0, documents: 0, models: usage, memory: 0, reports: 0 };
}
