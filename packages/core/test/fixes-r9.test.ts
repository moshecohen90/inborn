import { describe, expect, it } from "vitest";
import { InMemoryChatRepository, searchExclusions } from "../src/chat/repository";
import { appendAudit, cleanSubject, emptyAuditLog, subjectRef, verifyAudit } from "../src/work/audit";
import { citationLabel, pageUnit } from "../src/rag/citations";
import { pickedFileName } from "../src/rag/extract/sniff";
import { isAbsoluteLocation, resolveStoredPath, toStoredPath } from "../src/paths/storedPath";
import { keepOnWipe } from "../src/paths/wipePolicy";
import { chooseTtsEngine, engineSpeaks } from "../src/voice/ttsEngine";

const IOS_A = "file:///var/mobile/Containers/Data/Application/3FA3E8BA-1111-4A4A-8888-000000000001/Documents/";
const IOS_B = "file:///var/mobile/Containers/Data/Application/1A5594D6-2222-4B4B-9999-000000000002/Documents/";
const ANDROID = "file:///data/user/0/com.inbornapp.mobile/files/";

describe("F1 · chats search never reaches into a locked vault (spec §7.8, T48)", () => {
  const seed = async () => {
    const repo = new InMemoryChatRepository();
    const vault = await repo.createFolder("Client A");
    const open = await repo.createChat({ modelId: "instant", title: "Lease review for Dana" });
    const hidden = await repo.createChat({ modelId: "instant", title: "Lease dispute Dana Levi" });
    await repo.updateChat(hidden.id, { folderId: vault.id });
    await repo.appendMessage({ chatId: hidden.id, role: "user", content: "Dana wants the lease deposit back" });
    await repo.appendMessage({ chatId: open.id, role: "user", content: "Is the lease deposit refundable?" });
    return { repo, vault, open, hidden };
  };
  it("excludes every chat filed in a hidden folder, titles and snippets alike", async () => {
    const { repo, vault, open, hidden } = await seed();
    const locked = await repo.search("dana lease", { hiddenFolderIds: [vault.id] });
    expect(locked.map((h) => h.chatId)).toEqual([open.id]);
    expect(JSON.stringify(locked)).not.toContain("dispute");
    expect(JSON.stringify(locked)).not.toContain("deposit back");
    const unlocked = await repo.search("dana lease", { hiddenFolderIds: [] });
    expect(unlocked.map((h) => h.chatId).sort()).toEqual([hidden.id, hidden.id, open.id].sort());
    expect(await repo.search("dana lease")).toHaveLength(3);
  });
  it("searchExclusions maps hidden folders to chat ids and ignores the root", () => {
    const chats = [{ id: "a", folderId: "v" }, { id: "b" }, { id: "c", folderId: "w" }];
    expect([...searchExclusions(chats, ["v"])]).toEqual(["a"]);
    expect(searchExclusions(chats, undefined).size).toBe(0);
    expect(searchExclusions(chats, new Set(["v", "w"])).size).toBe(2);
  });
});

describe("F7 · audit entries refer to chats by id, never by title", () => {
  it("keeps the vault's own name on creation and strips titles from every other action; the chain still verifies", () => {
    let log = emptyAuditLog("v1");
    log = appendAudit(log, "vault.created", 1, { title: "Client A" });
    log = appendAudit(log, "chat.moved-in", 2, { chatId: "0123456789abcdef", title: "Dana Levi divorce intake" });
    log = appendAudit(log, "export.signed", 3, { chatId: "0123456789abcdef", title: "Dana Levi divorce intake", recordHash: "ab".repeat(32) });
    log = appendAudit(log, "chat.moved-out", 4, { title: "only a title" });
    expect(log.entries[0]!.subject).toEqual({ title: "Client A" });
    expect(log.entries[1]!.subject).toEqual({ chatId: "0123456789abcdef" });
    expect(log.entries[2]!.subject).toEqual({ chatId: "0123456789abcdef", recordHash: "ab".repeat(32) });
    expect(log.entries[3]!.subject).toBeUndefined();
    expect(JSON.stringify(log)).not.toContain("Dana");
    expect(verifyAudit(log).ok).toBe(true);
    expect(cleanSubject("chat.created", { title: "x" })).toBeUndefined();
    expect(subjectRef({ chatId: "0123456789abcdef" })).toBe("chat 01234567");
    expect(subjectRef({ documentId: "doc-9" })).toBe("document doc-9");
    expect(subjectRef(undefined)).toBeNull();
  });
});

describe("F8 · citation labels say what the number is", () => {
  it("pages for PDF and scans, sheets for workbooks, 'part' for text cut into sections", () => {
    expect(pageUnit("pdf")).toBe("page");
    expect(pageUnit("image")).toBe("page");
    expect(pageUnit("xlsx")).toBe("sheet");
    for (const kind of ["html", "docx", "txt", "md", "csv"] as const) expect(pageUnit(kind)).toBe("part");
    expect(citationLabel({ docName: "policy.html", kind: "html", page: 3 })).toBe("policy.html · part 3");
    expect(citationLabel({ docName: "policy.html", kind: "html", page: 3 }, { page: "עמ׳ ", sheet: "גיליון ", part: "חלק " })).toBe("policy.html · חלק 3");
    expect(citationLabel({ docName: "contract.pdf", kind: "pdf", page: 4 })).toBe("contract.pdf · p.4");
  });
});

describe("F3 · the picked file's name comes back with its extension", () => {
  const PK = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]);
  it("takes the provider's display name, else the URI name, else MIME, else the magic bytes", () => {
    expect(pickedFileName({ uriName: "document:1000000028", displayName: "budget.xlsx", head: PK })).toBe("budget.xlsx");
    expect(pickedFileName({ uriName: "document%3A1000000028", displayName: null, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", head: PK })).toBe("document.xlsx");
    expect(pickedFileName({ uriName: "1000000027", displayName: "policy2", mimeType: "text/plain" })).toBe("policy2.txt");
    expect(pickedFileName({ uriName: "lease.docx", displayName: null, mimeType: null })).toBe("lease.docx");
    expect(pickedFileName({ uriName: "scan", head: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]) })).toBe("scan.pdf");
    expect(pickedFileName({ uriName: "1000000030", displayName: "Notes", head: new TextEncoder().encode("<!doctype html><html>") })).toBe("Notes.html");
    expect(pickedFileName({ uriName: "1000000031" })).toBe("document");
    expect(pickedFileName({ uriName: "report.PDF", displayName: "Report (final).pdf" })).toBe("Report (final).pdf");
  });
});

describe("F11 · stored locations survive an iOS container move", () => {
  it("stores paths relative to the document directory and resolves them against the current one", () => {
    const stored = toStoredPath(`${IOS_A}documents/abc.pdf`, IOS_A);
    expect(stored).toBe("documents/abc.pdf");
    expect(resolveStoredPath(stored, IOS_B)).toBe(`${IOS_B}documents/abc.pdf`);
    expect(resolveStoredPath(stored, ANDROID)).toBe(`${ANDROID}documents/abc.pdf`);
  });
  it("migrates an absolute URI written under an older container, on both platforms", () => {
    expect(toStoredPath(`${IOS_A}documents/abc.pdf`, IOS_B)).toBe("documents/abc.pdf");
    expect(resolveStoredPath(`${IOS_A}images/x.jpg`, IOS_B)).toBe(`${IOS_B}images/x.jpg`);
    expect(toStoredPath("file:///data/data/com.inbornapp.mobile/files/documents/a.docx", ANDROID)).toBe("documents/a.docx");
    expect(resolveStoredPath("file:///data/data/com.inbornapp.mobile/files/documents/a.docx", ANDROID)).toBe(`${ANDROID}documents/a.docx`);
  });
  it("leaves what is not ours alone: content://, blob:, the bundle, a Play pack, a web fixture", () => {
    for (const u of ["content://com.android.providers.downloads.documents/document/1", "blob:inborn/1/x.pdf", "/fixtures/policy.html", "file:///private/var/containers/Bundle/Application/X/Inborn.app/instant.gguf"]) {
      expect(toStoredPath(u, IOS_B)).toBe(u);
      expect(resolveStoredPath(u, IOS_B)).toBe(u);
    }
    expect(isAbsoluteLocation("documents/a.pdf")).toBe(false);
    expect(isAbsoluteLocation("file:///x")).toBe(true);
    expect(toStoredPath("", IOS_A)).toBe("");
    expect(resolveStoredPath("documents/a.pdf", IOS_B.slice(0, -1))).toBe(`${IOS_B}documents/a.pdf`);
  });
});

describe("F2 · wipe keeps every model file when the switch is off", () => {
  it("keeps the models and joined-pack directories and top-level model files; deletes them when asked", () => {
    expect(keepOnWipe({ name: "models", directory: true }, true)).toBe(true);
    expect(keepOnWipe({ name: "assetpacks-joined", directory: true }, true)).toBe(true);
    expect(keepOnWipe({ name: "instant.gguf", directory: false }, true)).toBe(true);
    expect(keepOnWipe({ name: "whisper.bin", directory: false }, true)).toBe(true);
    expect(keepOnWipe({ name: "documents", directory: true }, true)).toBe(false);
    expect(keepOnWipe({ name: "prefs.json", directory: false }, true)).toBe(false);
    expect(keepOnWipe({ name: "models", directory: true }, false)).toBe(false);
    expect(keepOnWipe({ name: "instant.gguf", directory: false }, false)).toBe(false);
  });
});

describe("F5 · read-aloud engine choice (T44)", () => {
  const intu = { name: "com.intu.hebrewtts", isDefault: true, languages: [] as string[] };
  const google = { name: "com.google.android.tts", isDefault: false, languages: ["en_US", "de-DE", "fr_FR"] };
  const other = { name: "org.other.tts", isDefault: false, languages: ["he-IL", "en-GB"] };
  it("prefers the default engine only when it reports the language", () => {
    expect(chooseTtsEngine([{ ...intu, languages: ["he_IL"] }, google], "he-IL")?.name).toBe("com.intu.hebrewtts");
    expect(chooseTtsEngine([intu, google], "en-US")?.name).toBe("com.google.android.tts");
    expect(chooseTtsEngine([intu, google, other], "he-IL")?.name).toBe("org.other.tts");
    expect(chooseTtsEngine([intu, other, google], "en")?.name).toBe("com.google.android.tts");
  });
  it("returns null when no engine has a voice, so nothing is bound and no activity opens", () => {
    expect(chooseTtsEngine([intu, google], "he-IL")).toBeNull();
    expect(chooseTtsEngine([], "en-US")).toBeNull();
    expect(engineSpeaks(google, "en-GB")).toBe(true);
    expect(engineSpeaks(google, "ja-JP")).toBe(false);
  });
});
