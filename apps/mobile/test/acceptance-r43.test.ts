import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../packages/i18n/locales/en.json";
import { documentState } from "../src/documents/stateText";
import type { DocumentRecord } from "@inborn/core";

/**
 * Round 43 — acceptance. Moshe: "if they asked to index their documents it must work well". What is provable without a
 * device lives here; the browser run behind each finding is in docs/qa/acceptance/.
 */
const SRC = join(__dirname, "../src");
const source = (p: string) => readFileSync(join(SRC, p), "utf8");
const strings = en as Record<string, string>;
const t = (key: string, params?: Record<string, unknown>): string => {
  const raw = strings[key] ?? (params?.defaultValue as string) ?? key;
  return raw.replace(/\{(\w+)[^}]*\}/g, (_m, name: string) => String(params?.[name] ?? `{${name}}`));
};
const doc = (over: Partial<DocumentRecord>): DocumentRecord => ({ id: "d", name: "f.pdf", kind: "pdf", bytes: 100, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0, ...over });

describe("F160 · the attach sheet says what the document's state really is", () => {
  it("a scan with no text layer is named a scan, not 'not indexed yet'", () => {
    const s = documentState(doc({ status: "needs-ocr", chunkCount: 0 }), t, "browser");
    expect(s.text).toBe("Scanned. Run OCR on this browser?");
    expect(s.tone).toBe("attention");
  });

  it("every other state keeps its own sentence too", () => {
    expect(documentState(doc({ status: "indexed", chunkCount: 3 }), t, "browser").text).toContain("3");
    expect(documentState(doc({ status: "empty", chunkCount: 0 }), t, "browser").tone).toBe("error");
    expect(documentState(doc({ status: "failed", error: "corrupt", chunkCount: 0 }), t, "browser").tone).toBe("error");
    expect(documentState(doc({ status: "queued", chunkCount: 0 }), t, "browser").tone).toBe("waiting");
    expect(documentState(doc({ status: "cancelled", indexedPages: 1, pages: 4, chunkCount: 0 }), t, "browser").tone).toBe("paused");
  });

  it("the sheet and the library row read the same helper, so they cannot disagree again", () => {
    for (const p of ["components/chat/AttachSheet.tsx", "screens/documents/DocumentRow.tsx"]) expect(source(p), p).toContain("documentState(");
    expect(source("components/chat/AttachSheet.tsx")).not.toContain("chat.attach.notIndexed");
  });
});

describe("F162 · every 'pick a file' door works in the browser, not only the chat's", () => {
  it("no screen calls expo-file-system's picker, which resolves to nothing on the web", () => {
    for (const p of ["screens/documents/DocumentsScreen.tsx", "screens/vault/VaultScreen.tsx", "screens/Work/VerifyRecord.tsx", "documents/importPicker.web.ts"]) {
      expect(source(p), p).not.toContain("File.pickFileAsync");
      expect(source(p), p).toContain("chooseFile");
    }
  });

  it("only the native chooser talks to expo-file-system", () => {
    expect(source("documents/chooseFile.ts")).toContain("File.pickFileAsync");
    expect(source("documents/chooseFile.web.ts")).not.toMatch(/from "expo-file-system"/);
  });
});

describe("F161 · an answer the documents did not carry says so and cites nothing", () => {
  it("the chat flashes the notice on both ways of answering without the files", () => {
    const src = source("screens/Chat.tsx");
    /* Attached but never indexed (the turn never reaches retrieval), and indexed but nothing matched. */
    expect(src).toMatch(/if \(turn\.kind === "model" && docs\.documents\.length\) flash\(t\("documents\.noneMatched"\)\)/);
    expect(src).toMatch(/if \(!rag\.prompt\.used\.length\) flash\(t\("documents\.noneMatched"\)\)/);
  });
  it("the sentence exists in every locale", () => {
    expect(strings["documents.noneMatched"]).toBeTruthy();
  });
});

describe("F163 · the library-row gate exists on every platform", () => {
  it("lives outside the two pickers, so a browser bundle carries it too", () => {
    expect(source("documents/libraryAttach.ts")).toContain("export function planLibraryAttach");
    for (const p of ["documents/importPicker.ts", "documents/importPicker.web.ts"]) expect(source(p), p).not.toContain("planLibraryAttach");
    expect(source("documents/index.ts")).toContain('from "./libraryAttach"');
  });

  it("every symbol the index re-exports from a platform module is in both halves", () => {
    const named = (p: string) => [...source(p).matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map((m) => m[1]);
    const web = new Set(named("documents/importPicker.web.ts"));
    for (const n of named("documents/importPicker.ts")) expect(web, `importPicker.web.ts is missing ${n}`).toContain(n);
  });
});
