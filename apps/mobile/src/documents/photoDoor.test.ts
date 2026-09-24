import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kindOf } from "@inborn/core";
import { runPick, type PickDeps } from "./pickPlan";
import { planDrop } from "./dropped";

/**
 * F343, the file door. On build 18 with no photo pack, "Add a file… or a photo" (and a photo shared in from the
 * Photos app) indexed the picture as a document, and the question about it was answered with a refusal about the
 * document index model. A picture is a picture through every door.
 */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF = new TextEncoder().encode("%PDF-1.7\n");

const deps = (name: string, head: Uint8Array) => {
  const imported: string[] = [];
  const d: PickDeps = {
    choose: async () => ({ uri: `file:///Documents/${name}`, name, text: async () => "" }),
    nameOf: (f) => f.name,
    kindOf: (_uri, n) => kindOf(n, head),
    importFile: async (_uri, n) => {
      imported.push(n);
      return { id: `id-${n}`, status: "indexed" };
    },
  };
  return { d, imported };
};

describe("F343 · a picture through the file door is a photo, never a document", () => {
  it("a picked JPEG comes back as a photo and is not imported into the library", async () => {
    const { d, imported } = deps("IMG_1234.jpg", JPEG);
    await expect(runPick("pro", 0, d)).resolves.toEqual({ kind: "photo", uri: "file:///Documents/IMG_1234.jpg", name: "IMG_1234.jpg" });
    expect(imported).toEqual([]);
  });

  it("the magic bytes decide, not the name: a JPEG called 'scan' is still a photo", async () => {
    const { d, imported } = deps("scan", JPEG);
    await expect(runPick("pro", 0, d)).resolves.toMatchObject({ kind: "photo" });
    expect(imported).toEqual([]);
  });

  it("the complement: a PDF still goes into the library", async () => {
    const { d, imported } = deps("report.pdf", PDF);
    await expect(runPick("pro", 0, d)).resolves.toEqual({ kind: "imported", id: "id-report.pdf" });
    expect(imported).toEqual(["report.pdf"]);
  });

  it("a picture dropped on the desktop window is turned away from Documents with its own reason, a PDF is not", () => {
    const plan = planDrop([{ path: "/tmp/door.jpg", head: JPEG }, { path: "/tmp/report.pdf", head: PDF }], "pro");
    expect(plan.rejected).toEqual([{ name: "door.jpg", reason: "photo" }]);
    expect(plan.accept.map((f) => f.name)).toEqual(["report.pdf"]);
  });

  it("the chat sends every door's picture to the composer: file picker, share sheet and the dev file line", () => {
    const chat = readFileSync(join(__dirname, "../screens/Chat.tsx"), "utf8");
    expect(chat).toContain('else if (r.kind === "photo") void addPhotoFiles([r.uri]);');
    const share = chat.slice(chat.indexOf("if (seed.kind === \"files\")"), chat.indexOf("if (seed.text) setDraft(seed.text);"));
    expect(share).toMatch(/if \(kind === "image"\) \{\s*photos\.push\(f\.uri\);\s*continue;/);
    expect(share).toContain("await addPhotoFiles(photos)");
    /* The share door must not index a picture: the import sits after the image branch. */
    expect(share.indexOf("photos.push(f.uri)")).toBeLessThan(share.indexOf("library.importFile("));
    const docsScreen = readFileSync(join(__dirname, "../screens/documents/DocumentsScreen.tsx"), "utf8");
    expect(docsScreen).toContain('if (kind === "image") return setToast(t("documents.drop.photo"');
  });
});
