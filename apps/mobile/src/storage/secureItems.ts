/** Every Keychain / Keystore item the app writes. The emergency wipe deletes each one (spec §5.7); add new items here, nowhere else. */
export const SECURE_ITEMS = {
  /** SQLCipher key for inborn.db (chats + document index). */
  dbKey: "inborn.db.key",
  /** Salted passcode hash of the app lock. */
  passcode: "inborn.lock.passcode",
  /** Client vault records: folder id, salt, code hash, audit head (Pro for Work). */
  workVaults: "inborn.work.vaults",
  /** Ed25519 seed that signs exported records (Pro for Work); created at the first signed export. */
  workSigning: "inborn.work.signing",
} as const;

export const SECURE_ITEM_LIST: readonly string[] = Object.values(SECURE_ITEMS);

/** Deletes every item; one failure never stops the others. Returns the items that could not be deleted. */
export async function wipeSecureItems(del: (item: string) => Promise<void>): Promise<string[]> {
  const failed: string[] = [];
  for (const item of SECURE_ITEM_LIST) {
    try {
      await del(item);
    } catch {
      failed.push(item);
    }
  }
  return failed;
}
