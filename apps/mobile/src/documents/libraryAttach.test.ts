import { describe, expect, it, vi } from "vitest";

/* The verdict is pure; the module it lives in reaches the picker and the file layer, which do not exist off-device. */
vi.mock("expo-file-system", () => ({ File: { pickFileAsync: () => Promise.resolve({ canceled: true }) } }));
vi.mock("./library", () => ({ FREE_PAGE_CAP: 20 }));
vi.mock("./office", () => ({ PICK_TYPES: [], pickedName: () => "", sniffPicked: () => "pdf" }));
import type { DocumentRecord } from "@inborn/core";
import { attachRowLock, planLibraryAttach } from "./libraryAttach";

const doc = (id: string, kind: DocumentRecord["kind"]): DocumentRecord => ({
  id,
  name: `${id}.${kind}`,
  kind,
  bytes: 1,
  pages: 1,
  addedAt: 0,
  status: "indexed",
  indexedPages: 1,
  chunkCount: 1,
  flaggedLines: 0,
  ocrPages: 0,
});

const library = [doc("a", "pdf"), doc("b", "pdf"), doc("sheet", "xlsx"), doc("page", "html")];

describe("planLibraryAttach (QA F129)", () => {
  it("lets a free chat attach its one document", () => {
    expect(planLibraryAttach("free", library, "a", 0)).toEqual({ kind: "ok" });
  });

  it("stops the second one on free, whatever door it came through", () => {
    /* On the 6T this attached bearings.xlsx AND a 40-page PDF to one free chat and answered from both. */
    expect(planLibraryAttach("free", library, "b", 1)).toEqual({ kind: "paywall", moment: "document" });
  });

  it("keeps a work format behind the work tier even when the library already holds it", () => {
    /* The file entered the library while the licence said work; the licence is asked again, not the library. */
    expect(planLibraryAttach("pro", library, "sheet", 0)).toEqual({ kind: "paywall", moment: "office" });
    expect(planLibraryAttach("pro", library, "page", 0)).toEqual({ kind: "paywall", moment: "office" });
    expect(planLibraryAttach("work", library, "sheet", 3)).toEqual({ kind: "ok" });
  });

  it("does not cap pro and work by count", () => {
    expect(planLibraryAttach("pro", library, "b", 9)).toEqual({ kind: "ok" });
    expect(planLibraryAttach("work", library, "b", 9)).toEqual({ kind: "ok" });
  });

  it("says ok for an id the library no longer has, so a stale row cannot block the chat", () => {
    expect(planLibraryAttach("free", library, "gone", 0)).toEqual({ kind: "ok" });
  });
});

/**
 * F199. The row's lock came from the count gate only, so on Free with nothing attached a `.xlsx` row rendered with no
 * PRO chip and refused when pressed. The sheet now asks the same call the tap makes.
 */
describe("F199 · the attach row's lock is the verdict the tap will get", () => {
  it("locks a work format on free with nothing attached, and names the work moment", () => {
    expect(attachRowLock("free", library, "sheet", 0, false)).toEqual({ locked: true, moment: "office" });
    expect(attachRowLock("pro", library, "page", 0, false)).toEqual({ locked: true, moment: "office" });
  });

  it("locks the second file on free with the document moment", () => {
    expect(attachRowLock("free", library, "b", 1, false)).toEqual({ locked: true, moment: "document" });
  });

  it("leaves an allowed row open", () => {
    expect(attachRowLock("free", library, "a", 0, false)).toEqual({ locked: false, moment: null });
    expect(attachRowLock("work", library, "sheet", 2, false)).toEqual({ locked: false, moment: null });
  });

  it("never locks a row that is already attached: that tap detaches", () => {
    for (const [tier, id, count] of [["free", "sheet", 3], ["free", "b", 2], ["pro", "page", 1]] as const) {
      expect(attachRowLock(tier, library, id, count, true)).toEqual({ locked: false, moment: null });
    }
  });

  it("agrees with the tap on every row, tier and count", () => {
    for (const tier of ["free", "pro", "work"] as const) {
      for (const d of library) {
        for (const count of [0, 1, 2]) {
          const verdict = planLibraryAttach(tier, library, d.id, count);
          expect(attachRowLock(tier, library, d.id, count, false), `${tier}/${d.id}/${count}`).toEqual(
            verdict.kind === "paywall" ? { locked: true, moment: verdict.moment } : { locked: false, moment: null },
          );
        }
      }
    }
  });
});
