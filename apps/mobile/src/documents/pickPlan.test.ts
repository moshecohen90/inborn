import { describe, expect, it } from "vitest";
import type { DocumentRecord } from "@inborn/core";
import { runPick, type PickDeps } from "./pickPlan";
import type { ChosenFile } from "./chooseFile";

/**
 * F197. "Add a file" was two copies of the same twelve lines, one per platform, guarded by a test that compared
 * exported symbol names. These run the gates instead.
 */
const file = (name: string): ChosenFile => ({ uri: `blob:${name}`, name, text: async () => "" });

const deps = ({ picked, status, nameOf }: { picked?: ChosenFile | null; status?: DocumentRecord["status"]; nameOf?: PickDeps["nameOf"] } = {}) => {
  const calls = { chose: 0, imported: [] as string[] };
  const d: PickDeps = {
    choose: async () => {
      calls.chose++;
      return picked === undefined ? file("report.pdf") : picked;
    },
    nameOf: nameOf ?? ((f) => f.name),
    kindOf: (_uri, name) => (name.endsWith(".xlsx") ? "xlsx" : "pdf"),
    importFile: async (_uri, name) => {
      calls.imported.push(name);
      return { id: `id-${name}`, status: status ?? "indexed", error: status === "failed" ? "corrupt" : undefined };
    },
  };
  return { d, calls };
};

describe("F197 · one pick sequence for every platform", () => {
  it("imports the picked file and hands back its id", async () => {
    const { d, calls } = deps();
    await expect(runPick("pro", 0, d)).resolves.toEqual({ kind: "imported", id: "id-report.pdf" });
    expect(calls.imported).toEqual(["report.pdf"]);
  });

  it("refuses the second file on Free before the picker even opens", async () => {
    const { d, calls } = deps();
    await expect(runPick("free", 1, d)).resolves.toEqual({ kind: "paywall", moment: "document" });
    expect(calls.chose, "the picker must not open for a refused tap").toBe(0);
    expect(calls.imported).toEqual([]);
  });

  it("lets Free import its first file", async () => {
    const { d } = deps();
    await expect(runPick("free", 0, d)).resolves.toMatchObject({ kind: "imported" });
  });

  it("refuses a Work format after the pick, and never imports it", async () => {
    const { d, calls } = deps({ picked: file("books.xlsx") });
    await expect(runPick("pro", 0, d)).resolves.toEqual({ kind: "paywall", moment: "office" });
    expect(calls.imported).toEqual([]);
  });

  it("lets Work import the same spreadsheet", async () => {
    const { d } = deps({ picked: file("books.xlsx") });
    await expect(runPick("work", 0, d)).resolves.toEqual({ kind: "imported", id: "id-books.xlsx" });
  });

  it("reports a cancel as a cancel, not an error", async () => {
    const { d, calls } = deps({ picked: null });
    await expect(runPick("pro", 0, d)).resolves.toEqual({ kind: "cancelled" });
    expect(calls.imported).toEqual([]);
  });

  it("turns a failed or empty import into the error the sheet shows", async () => {
    await expect(runPick("pro", 0, deps({ status: "failed" }).d)).resolves.toEqual({ kind: "error", error: "corrupt" });
    await expect(runPick("pro", 0, deps({ status: "empty" }).d)).resolves.toEqual({ kind: "error", error: "empty" });
  });

  it("asks for the file's real name, not the URI's last segment", async () => {
    const { d } = deps({ picked: { uri: "content://downloads/document:1000000028", name: "document:1000000028", text: async () => "" }, nameOf: () => "accounts.xlsx" });
    await expect(runPick("pro", 0, d)).resolves.toEqual({ kind: "paywall", moment: "office" });
  });
});
