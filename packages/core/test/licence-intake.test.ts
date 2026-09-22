import { describe, expect, it } from "vitest";
import { WORK_DOC_KINDS, fileIntake, isWorkKind } from "../src/licence";
import { parseSharePayload } from "../src/chat/shareTarget";
import { kindOf, pickedFileName } from "../src/rag/extract/sniff";
import type { DocKind } from "../src/rag/types";

/**
 * One gate for every door into the library (§7.3). The share target used to import straight into `library.importFile`,
 * so a Free user could attach ten files and a Pro user could attach a spreadsheet (QA F72).
 */
describe("fileIntake (spec §7.3 rows 1 and 8)", () => {
  it("Free gets exactly one attachment, in any of the formats row 1 names", () => {
    for (const kind of ["pdf", "txt", "md", "docx", "csv"] as DocKind[]) expect(fileIntake("free", kind, 0), kind).toEqual({ kind: "ok" });
    for (const kind of ["pdf", "txt", "md", "docx", "csv"] as DocKind[]) expect(fileIntake("free", kind, 1), kind).toEqual({ kind: "paywall", moment: "document" });
  });

  it("Excel and HTML are Work whatever the count, and the count is answered first", () => {
    expect(fileIntake("free", "xlsx", 0)).toEqual({ kind: "paywall", moment: "office" });
    expect(fileIntake("free", "xlsx", 1)).toEqual({ kind: "paywall", moment: "document" });
    expect(fileIntake("pro", "xlsx", 40)).toEqual({ kind: "paywall", moment: "office" });
    expect(fileIntake("pro", "html", 0)).toEqual({ kind: "paywall", moment: "office" });
    expect(fileIntake("work", "xlsx", 40)).toEqual({ kind: "ok" });
    expect(fileIntake("work", "html", 0)).toEqual({ kind: "ok" });
  });

  it("Pro lifts the file cap and nothing else", () => {
    expect(fileIntake("pro", "pdf", 99)).toEqual({ kind: "ok" });
    expect(fileIntake("work", "pdf", 99)).toEqual({ kind: "ok" });
  });

  it("DOCX and CSV are not Work formats: §7.3 row 1 names them in the Free attachment", () => {
    expect(WORK_DOC_KINDS).toEqual(["xlsx", "html"]);
    for (const kind of ["docx", "csv", "pdf", "txt", "md", "image", "unknown"] as DocKind[]) expect(isWorkKind(kind), kind).toBe(false);
    for (const kind of ["xlsx", "html"] as DocKind[]) expect(isWorkKind(kind), kind).toBe(true);
  });

  it("the complement holds: no tier and kind combination is refused for a reason the caller cannot name", () => {
    for (const tier of ["free", "pro", "work"] as const) {
      for (const kind of ["pdf", "docx", "xlsx", "html", "csv", "txt", "md", "image", "unknown"] as DocKind[]) {
        const v = fileIntake(tier, kind, 0);
        if (v.kind === "paywall") expect(["document", "office"]).toContain(v.moment);
        else expect(v).toEqual({ kind: "ok" });
      }
    }
  });
});

/**
 * The share door end to end, minus the React glue: the payload shapes `parseSharePayload` really produces, named the
 * way `sharedName` names them, sniffed the way `sniffPicked` sniffs them, answered by the same gate as the picker.
 */
describe("a shared-in file meets the same gate as a picked one", () => {
  const nameOf = (f: { uri: string; name: string; mimeType: string | null }) => pickedFileName({ uriName: f.name, displayName: f.name, mimeType: f.mimeType, head: new Uint8Array() });
  const verdict = (tier: "free" | "pro" | "work", raw: unknown, attached: number) => {
    const payload = parseSharePayload(raw);
    if (payload?.kind !== "files") throw new Error("not a file share");
    const f = payload.files[0]!;
    return fileIntake(tier, kindOf(nameOf(f), new Uint8Array()), attached);
  };

  const xlsx = { kind: "files", files: [{ uri: "file:///cache/shared/q3.xlsx", name: "q3.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: 900 }] };
  const pdf = { kind: "files", files: [{ uri: "file:///cache/shared/a.pdf", name: "a.pdf", mimeType: "application/pdf", bytes: 1234 }] };

  it("a shared spreadsheet is refused on Free and on Pro, and accepted on Work", () => {
    expect(verdict("free", xlsx, 0)).toEqual({ kind: "paywall", moment: "office" });
    expect(verdict("pro", xlsx, 0)).toEqual({ kind: "paywall", moment: "office" });
    expect(verdict("work", xlsx, 0)).toEqual({ kind: "ok" });
  });

  it("a second shared file is refused on Free, which is the cap the share target used to walk past", () => {
    expect(verdict("free", pdf, 0)).toEqual({ kind: "ok" });
    expect(verdict("free", pdf, 1)).toEqual({ kind: "paywall", moment: "document" });
    expect(verdict("pro", pdf, 9)).toEqual({ kind: "ok" });
  });

  it("an extensionless shared name still resolves to its Work format through the MIME type", () => {
    const blob = { type: "file", text: null, files: [{ path: "file:///g/blob", fileName: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: "900" }] };
    expect(verdict("pro", blob, 0)).toEqual({ kind: "paywall", moment: "office" });
  });
});
