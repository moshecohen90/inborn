import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { dismissRepair, repairOutcome, reportRepair, subscribeRepair } from "./repairNotice";

const source = (name: string) => readFileSync(join(__dirname, name), "utf8");
const repository = source("sqliteRepository.ts");
const openBody = repository.slice(repository.indexOf("static async open()"), repository.indexOf("async listChats()"));
const banners = readFileSync(join(__dirname, "..", "components", "shell", "Banners.tsx"), "utf8");
const en = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "..", "packages", "i18n", "locales", "en.json"), "utf8")) as Record<string, string>;

describe("a damaged chat database is repaired, not deleted (spec §5.3, F58)", () => {
  beforeEach(dismissRepair);

  it("nothing in the open path deletes the database any more", () => {
    /* The bug: "not a database" was answered with deleteDatabaseAsync, which is every chat the user ever had. */
    expect(openBody).not.toContain("deleteDatabaseAsync");
    expect(repository).not.toContain("deleteDatabaseAsync");
    expect(openBody).toContain("quarantineDatabase(DB_NAME)");
  });

  it("an unreadable file is kept aside and the user is told, instead of vanishing", () => {
    expect(openBody).toMatch(/isUnreadableDatabase\(describe\(e\)\)/);
    expect(openBody).toContain('kind: "started-fresh"');
    expect(openBody).toContain("reportRepair(repaired)");
  });

  it("a file that opens but fails quick_check is rebuilt from whatever is still readable", () => {
    expect(openBody).toContain("quickCheck(db)");
    const rebuild = repository.slice(repository.indexOf("async function rebuild"), repository.indexOf("/** SQLCipher-encrypted chats"));
    expect(rebuild).toContain("salvage(sqlDriverOf(damaged), sqlDriverOf(fresh), SALVAGE_TABLES)");
    /* Quarantine before promote: the damaged file is out of the way before anything takes its name. */
    expect(rebuild.indexOf("quarantineDatabase(DB_NAME)")).toBeLessThan(rebuild.indexOf("promoteDatabase("));
  });

  it("copies the documents and the search index too, since they live in the same file", () => {
    expect(repository).toContain("RAG_SCHEMA_SQL");
    expect(repository).toContain("FTS_SQL");
    for (const table of ["chats", "messages", "documents", "chunks", "vectors"]) expect(repository).toContain(`"${table}"`);
    /* Parents before children, or every message loses its foreign key. */
    const order = repository.slice(repository.indexOf("const SALVAGE_TABLES"), repository.indexOf("const REPAIR_DB_NAME"));
    expect(order.indexOf('"chats"')).toBeLessThan(order.indexOf('"messages"'));
    expect(order.indexOf('"documents"')).toBeLessThan(order.indexOf('"chunks"'));
  });

  it("the §8.8 strip is where the user finds out, in every shipped language", () => {
    expect(banners).toContain("useRepairOutcome()");
    expect(banners).toContain('t("state.dbStartedFresh")');
    expect(banners).toContain('t("state.dbRepaired", { count: repair.lost })');
    expect(banners).toContain("onPress: dismissRepair");
    expect(en["state.dbRepaired"]).toContain("plural");
  });

  it("holds the outcome until the user dismisses it, and tells the strip both times", () => {
    let notified = 0;
    expect(repairOutcome()).toBeNull();
    reportRepair({ kind: "rebuilt", copied: 412, lost: 3, quarantined: "inborn.db.corrupt-x" });
    expect(repairOutcome()).toMatchObject({ kind: "rebuilt", lost: 3 });
    /* Subscribed after the fact on purpose: boot reports the repair long before the strip is mounted. */
    const off = subscribeRepair(() => notified++);
    dismissRepair();
    expect(repairOutcome()).toBeNull();
    expect(notified).toBe(1);
    dismissRepair();
    expect(notified).toBe(1);
    off();
  });
});
