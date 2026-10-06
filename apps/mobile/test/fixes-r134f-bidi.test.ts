import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { citationLabel, PAGE_WORDS, type Citation } from "@inborn/core";
import { isolateName, nameLine, shownCitationLabel } from "../src/lib/fileNames";

/**
 * Round 134F (Build 38, J7-04 / J7-27): a Hebrew file name read "pdf · p.1–2.קובץ" in a source chip and "pdf.קובץ" in the
 * attached-file row. The line took its direction from the name's first letter; the name is now isolated and the line kept LTR.
 */
const LRI = "⁦";
const PDI = "⁩";
const src = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");
const cite = (docName: string, page: number, pageTo?: number): Pick<Citation, "docName" | "kind" | "page" | "pageTo"> => ({ docName, kind: "pdf", page, ...(pageTo ? { pageTo } : {}) });

describe("round 134F · Hebrew and Arabic file names keep their order", () => {
  it("wraps a Hebrew or Arabic name in LRI…PDI and leaves a Latin name alone", () => {
    expect(isolateName("קובץ.pdf")).toBe(`${LRI}קובץ.pdf${PDI}`);
    expect(isolateName("تقرير.docx")).toBe(`${LRI}تقرير.docx${PDI}`);
    expect(isolateName("report.pdf")).toBe("report.pdf");
    expect(isolateName("報告書.pdf")).toBe("報告書.pdf");
    expect(isolateName(isolateName("קובץ.pdf"))).toBe(`${LRI}קובץ.pdf${PDI}`);
  });

  it("a chip's label isolates the name only; the prompt's label stays plain", () => {
    expect(shownCitationLabel(cite("קובץ.pdf", 1, 2), PAGE_WORDS)).toBe(`${LRI}קובץ.pdf${PDI} · p.1–2`);
    expect(citationLabel({ ...cite("קובץ.pdf", 1, 2), docName: isolateName("קובץ.pdf") })).toBe(`${LRI}קובץ.pdf${PDI} · p.1–2`);
    expect(shownCitationLabel(cite("report.pdf", 4), PAGE_WORDS)).toBe("report.pdf · p.4");
    expect(citationLabel(cite("קובץ.pdf", 3))).toBe("קובץ.pdf · p.3");
  });

  it("a line holding an RTL name is an LTR line; a Latin line gets no style", () => {
    expect(nameLine("קובץ.pdf")).toEqual({ writingDirection: "ltr" });
    expect(nameLine(`Searching 1 document: ${isolateName("קובץ.pdf")}`)).toEqual({ writingDirection: "ltr" });
    expect(nameLine("report.pdf")).toBeUndefined();
  });

  it("every place that shows a file name uses the helper", () => {
    const citations = src("src/documents/Citations.tsx");
    expect(citations).not.toMatch(/\bcitationLabel\(/);
    expect(citations.match(/shownCitationLabel\(/g)?.length).toBe(4);
    expect(citations).toContain("nameLine(c.docName)");
    expect(src("src/screens/Chat.tsx")).toMatch(/docChipText, \{ color: theme\.text \}, nameLine\(d\.name\)\]/);
    expect(src("src/screens/Chat.tsx")).toContain('t("chat.attach.detach", { name: isolateName(d.name) })');
    expect(src("src/components/chat/AttachSheet.tsx")).toMatch(/label=\{d\.name\}\s+labelStyle=\{nameLine\(d\.name\)\}/);
    expect(src("src/components/chat/Sheet.tsx")).toContain("labelStyle]}>{label}</Text>");
    expect(src("src/screens/documents/DocumentRow.tsx")).toContain("nameLine(doc.name)");
    expect(src("src/screens/documents/DocumentDetails.tsx")).toContain("nameLine(doc.name)");
    const ask = src("src/screens/documents/AskDocuments.tsx");
    expect(ask).toContain("docs.map((d) => isolateName(d.name))");
    expect(ask).toContain("nameLine(names)");
    expect(src("src/screens/documents/DocumentsScreen.tsx").match(/isolateName\(/g)?.length).toBe(3);
  });
});
