import { describe, expect, it, vi } from "vitest";

/* The verdict is pure; the module it lives in reaches the picker and the file layer, which do not exist off-device. */
vi.mock("expo-file-system", () => ({ File: { pickFileAsync: () => Promise.resolve({ canceled: true }) } }));
vi.mock("./library", () => ({ FREE_PAGE_CAP: 20 }));
vi.mock("./office", () => ({ PICK_TYPES: [], pickedName: () => "", sniffPicked: () => "pdf" }));
import type { DocumentRecord } from "@inborn/core";
import { planLibraryAttach } from "./importPicker";

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
