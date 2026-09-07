import { describe, expect, it } from "vitest";
import { SECURE_ITEMS, SECURE_ITEM_LIST, wipeSecureItems } from "./secureItems";

/** QA B7: the passcode survived a wipe because the wipe only knew the database key. */
describe("secure items", () => {
  it("lists the database key and the lock passcode", () => {
    expect(SECURE_ITEM_LIST).toContain("inborn.db.key");
    expect(SECURE_ITEM_LIST).toContain("inborn.lock.passcode");
    expect(new Set(SECURE_ITEM_LIST).size).toBe(SECURE_ITEM_LIST.length);
  });
  it("the wipe deletes every item and reports the ones that failed", async () => {
    const deleted: string[] = [];
    const failed = await wipeSecureItems(async (item) => {
      if (item === SECURE_ITEMS.dbKey) throw new Error("locked");
      deleted.push(item);
    });
    expect(deleted).toContain(SECURE_ITEMS.passcode);
    expect(failed).toEqual([SECURE_ITEMS.dbKey]);
  });
});
