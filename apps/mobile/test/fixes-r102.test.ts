import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../src");
const WRAPPER = "components/shell/AppModal.tsx";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("F401 · every modal closes on Esc from its first frame", () => {
  const files = sources(SRC).map((p) => ({ rel: relative(SRC, p), text: readFileSync(p, "utf8") }));

  it("no screen renders react-native's Modal directly; AppModal is the only way in", () => {
    const direct = files.filter((f) => f.rel !== WRAPPER && (/<Modal\b/.test(f.text) || /import\s*\{[^}]*\bModal\b[^}]*\}\s*from\s*"react-native(-web)?"/.test(f.text)));
    expect(direct.map((f) => f.rel)).toEqual([]);
  });

  it("the nine plain modals and both sheets go through AppModal", () => {
    const users = files.filter((f) => /<AppModal\b/.test(f.text)).map((f) => f.rel).sort();
    expect(users).toEqual(
      [
        "components/chat/Sheet.tsx",
        "components/shell/CommandPalette.tsx",
        "components/shell/Sheet.tsx",
        "documents/Citations.tsx",
        "screens/Chats.tsx",
        "screens/documents/AskDocuments.tsx",
        "screens/documents/DocumentDetails.tsx",
        "screens/paywall/LicenceKeySheet.tsx",
        "screens/vault/HfSearch.tsx",
        "screens/vault/ModelDetails.tsx",
        "screens/vault/VaultScreen.tsx",
      ].sort(),
    );
  });

  it("AppModal wires the early Esc and keeps the caller's onShow", () => {
    const wrapper = files.find((f) => f.rel === WRAPPER)!.text;
    expect(wrapper).toMatch(/useEarlyEscape\(visible, onRequestClose\)/);
    expect(wrapper).toMatch(/onShow\?\.\(e\)/);
  });

  it("lint rejects a bare Modal import anywhere in apps/mobile/src", () => {
    const config = readFileSync(join(__dirname, "../../../eslint.config.mjs"), "utf8");
    expect(config).toMatch(/"no-restricted-imports"[\s\S]*name: "react-native", importNames: \["Modal"\]/);
  });
});

describe("F402 · the re-indexing line is derived from the library on every render", () => {
  it("Chat and the Ask sheet render reindexNotice, not the snapshot taken when the answer was retrieved", () => {
    for (const rel of ["screens/Chat.tsx", "screens/documents/AskDocuments.tsx"]) {
      const text = read(rel);
      expect(text).toMatch(/reindexNotice\(reindexing, libraryState\.documents\)/);
      expect(text).not.toMatch(/t\("documents\.reindexing", reindexing\)/);
      expect(text).toMatch(/t\("documents\.reindexDone"\)/);
    }
  });
});

function read(rel: string): string {
  return readFileSync(join(SRC, rel), "utf8");
}
