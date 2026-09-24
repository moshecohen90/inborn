import { describe, expect, it } from "vitest";
import { nameOfPath, planDrop, type DroppedEntry } from "./dropped";

const PDF = new TextEncoder().encode("%PDF-1.7");
const TEXT = new TextEncoder().encode("hello");
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
/** What the shell hands the planner: a path plus the first bytes it read from disk. */
const drop = (...paths: string[]): DroppedEntry[] =>
  paths.map((path) => {
    const ext = path.toLowerCase().split(".").pop() ?? "";
    if (ext === "pdf") return { path, head: PDF };
    if (ext === "docx" || ext === "xlsx" || ext === "zip" || ext === "key") return { path, head: ZIP };
    return { path, head: TEXT };
  });

const names = (files: { name: string }[]) => files.map((f) => f.name);

describe("desktop document drop (§8.9, F64)", () => {
  it("names a file from either separator, because a Windows path arrives verbatim", () => {
    expect(nameOfPath("/Users/moshe/Desktop/contract.pdf")).toBe("contract.pdf");
    expect(nameOfPath("C:\\Users\\moshe\\Desktop\\contract.pdf")).toBe("contract.pdf");
    expect(nameOfPath("contract.pdf")).toBe("contract.pdf");
  });

  it("Pro takes every supported document, in the order they were dropped; a picture is a photo, not a document (F343)", () => {
    const plan = planDrop(drop("/a/one.pdf", "/a/two.docx", "/a/three.md", "/a/four.txt", "/a/five.png"), "pro");
    expect(names(plan.accept)).toEqual(["one.pdf", "two.docx", "three.md", "four.txt"]);
    expect(plan.rejected).toEqual([{ name: "five.png", reason: "photo" }]);
  });

  it("names what it will not take instead of dropping it silently", () => {
    const plan = planDrop(drop("/a/keynote.key", "/a/notes.pdf", "/a/archive.zip"), "pro");
    expect(names(plan.accept)).toEqual(["notes.pdf"]);
    expect(plan.rejected).toEqual([
      { name: "keynote.key", reason: "unsupported" },
      { name: "archive.zip", reason: "unsupported" },
    ]);
  });

  it("a spreadsheet or a web page dropped by a Pro user is the Work moment, not an import", () => {
    const pro = planDrop(drop("/a/budget.xlsx", "/a/page.html"), "pro");
    expect(pro.accept).toEqual([]);
    expect(pro.rejected.map((r) => r.reason)).toEqual(["work-only", "work-only"]);
    const work = planDrop(drop("/a/budget.xlsx", "/a/page.html"), "work");
    expect(names(work.accept)).toEqual(["budget.xlsx", "page.html"]);
  });

  it("Free keeps its one attachment: the first file lands, the rest are named, not imported", () => {
    const plan = planDrop(drop("/a/one.pdf", "/a/two.pdf", "/a/three.pdf"), "free");
    expect(names(plan.accept)).toEqual(["one.pdf"]);
    expect(plan.rejected).toEqual([
      { name: "two.pdf", reason: "over-free-limit" },
      { name: "three.pdf", reason: "over-free-limit" },
    ]);
  });

  it("Free with a file already attached takes nothing, and says why", () => {
    const plan = planDrop(drop("/a/one.pdf"), "free", 1);
    expect(plan.accept).toEqual([]);
    expect(plan.rejected).toEqual([{ name: "one.pdf", reason: "over-free-limit" }]);
  });

  it("an empty drop is not an error", () => {
    expect(planDrop([], "free")).toEqual({ accept: [], rejected: [] });
  });
});
