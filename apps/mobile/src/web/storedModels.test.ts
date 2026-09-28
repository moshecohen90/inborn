import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatModelBytes } from "@inborn/core";
import { inventoryBytes, inventoryStatus, opfsInventory, opfsModelBytes, statusFrom, type ModelMeta } from "./opfs";
import { removable, storedLine, storedState } from "./storedModels";
import { doorBack } from "./doorReturn";
import { webStoredState, type WebBoot } from "./boot";
import type { WebModelChoice } from "./modelChoice";

/*
 * F445 (round 122, MosheAI on the lead's walk of main e61f222a): after Fast → Instant both stayed in OPFS (Privacy &
 * storage: Models 2.69 GB), yet the vault said "Choosing another here replaces it" and listed Fast as "Use this model"
 * with no installed state and no Remove. Every line about a stored text model now comes from one OPFS walk.
 */
const FAST = 1_280_835_840;
const INSTANT = 532_517_120;
const meta = (bytes: number): ModelMeta => ({ url: "/models/x.gguf", bytes, sha256: "ab", verified: true, at: "2026-09-28" });

function fakeStorage(dirs: Record<string, Record<string, number | ModelMeta>>): StorageManager {
  const file = (v: number | ModelMeta) => {
    const text = typeof v === "number" ? "" : JSON.stringify(v);
    return { kind: "file", getFile: async () => ({ size: typeof v === "number" ? v : text.length, text: async () => text }) };
  };
  const dir = (m: Record<string, number | ModelMeta>) => ({
    kind: "directory",
    async *entries() {
      for (const [k, v] of Object.entries(m)) yield [k, file(v)];
    },
  });
  return { getDirectory: async () => ({ getDirectoryHandle: async (n: string) => (dirs[n] ? dir(dirs[n]) : Promise.reject(new Error("NotFoundError"))) }) } as unknown as StorageManager;
}

/* The lead's browser after Fast → Instant: both models verified, both photo packs in wllama's cache. */
const both = () =>
  fakeStorage({
    models: { "fast.gguf": FAST, "fast.gguf.json": meta(FAST), "instant.gguf": INSTANT, "instant.gguf.json": meta(INSTANT), "instant.gguf.state.json": 40 },
    cache: { "sharp-photo.gguf": 668_227_264, "instant-photo.gguf": 204_987_232 },
  });

describe("one OPFS walk behind every stored-model line (F445)", () => {
  it("reads both models as ready from the walk, the same verdict modelStatus gives", async () => {
    const inv = await opfsInventory(both());
    expect(inventoryStatus(inv, "fast.gguf")).toEqual({ kind: "ready", meta: meta(FAST) });
    expect(inventoryStatus(inv, "instant.gguf")).toEqual({ kind: "ready", meta: meta(INSTANT) });
    expect(inventoryStatus(inv, "sharp.gguf")).toEqual({ kind: "missing" });
  });
  it("a file whose record does not match its bytes is half-downloaded, and a record with no file is nothing", () => {
    expect(statusFrom(400, meta(FAST))).toEqual({ kind: "partial", have: 400 });
    expect(statusFrom(400, null)).toEqual({ kind: "partial", have: 400 });
    expect(statusFrom(undefined, meta(FAST))).toEqual({ kind: "missing" });
    expect(statusFrom(0, meta(0))).toEqual({ kind: "missing" });
  });
  it("Privacy & storage's Models figure is the same walk, and drops by exactly what a removal deletes", async () => {
    const inv = await opfsInventory(both());
    const total = await opfsModelBytes(both());
    expect(inventoryBytes(inv)).toBe(total);
    const afterRemove = fakeStorage({
      models: { "instant.gguf": INSTANT, "instant.gguf.json": meta(INSTANT), "instant.gguf.state.json": 40 },
      cache: { "sharp-photo.gguf": 668_227_264, "instant-photo.gguf": 204_987_232 },
    });
    const fastFiles = FAST + JSON.stringify(meta(FAST)).length;
    expect(total - (await opfsModelBytes(afterRemove))).toBe(fastFiles);
  });
});

describe("what a row says about a stored model (F445)", () => {
  it("the model the page runs is in use and stays; another verified one is installed and can be removed", () => {
    const inUse = storedState({ kind: "ready", meta: meta(INSTANT) }, INSTANT, true);
    const installed = storedState({ kind: "ready", meta: meta(FAST) }, FAST, false);
    expect(inUse).toEqual({ kind: "in-use", bytes: INSTANT });
    expect(installed).toEqual({ kind: "installed", bytes: FAST });
    expect(removable(inUse)).toBe(false);
    expect(removable(installed)).toBe(true);
  });
  it("a half-downloaded file takes room, so it can be removed too; a missing one cannot", () => {
    expect(removable(storedState({ kind: "partial", have: 400 }, FAST, true))).toBe(true);
    expect(removable(storedState({ kind: "missing" }, FAST, false))).toBe(false);
  });
  it("names the size once, in the state line, and never the file", () => {
    expect(storedLine({ kind: "in-use", bytes: INSTANT }, formatModelBytes)).toEqual({ key: "vault.web.row.inUse", params: { size: "533 MB" } });
    expect(storedLine({ kind: "installed", bytes: FAST }, formatModelBytes)).toEqual({ key: "vault.web.row.installed", params: { size: "1.28 GB" } });
    expect(storedLine({ kind: "missing", bytes: FAST }, formatModelBytes)).toEqual({ key: "vault.web.row.missing", params: { size: "1.28 GB" } });
    expect(storedLine({ kind: "partial", have: 400_000_000, bytes: FAST }, formatModelBytes)).toEqual({ key: "vault.web.row.partial", params: { done: "400 MB", size: "1.28 GB" } });
  });
  it("the boot's rows: Instant in use, Fast installed, from the one stored map", () => {
    const choice = (id: string, bytes: number): WebModelChoice => ({ source: { id, name: id, file: `${id}.gguf`, bytes } as WebModelChoice["source"], model: null, recommended: false, installed: true, speed: undefined, languages: [] });
    const boot = {
      engine: "wllama",
      choices: [choice("fast", FAST), choice("instant", INSTANT)],
      source: choice("instant", INSTANT).source,
      stored: new Map([
        ["fast", { kind: "ready", meta: meta(FAST) }],
        ["instant", { kind: "ready", meta: meta(INSTANT) }],
      ]),
    } as unknown as WebBoot;
    expect(webStoredState(boot, "instant")).toEqual({ kind: "in-use", bytes: INSTANT });
    expect(webStoredState(boot, "fast")).toEqual({ kind: "installed", bytes: FAST });
    const removed = { ...boot, stored: new Map([["instant", { kind: "ready", meta: meta(INSTANT) }]]) } as unknown as WebBoot;
    expect(webStoredState(removed, "fast")).toEqual({ kind: "missing", bytes: FAST });
  });
});

describe("the door's way back (F445)", () => {
  it("returns to the Model sheet while the model left there is still on this browser", () => {
    const r = { to: "/", prev: "fast", sheet: true };
    expect(doorBack(r, ["fast"], "instant")).toEqual(r);
    expect(doorBack(r, [], "instant")).toBeNull();
  });
  it("returns to the vault whatever is installed: the vault needs no model", () => {
    const r = { to: "/vault", prev: "fast" };
    expect(doorBack(r, [], "instant")).toEqual(r);
  });
  it("no arrow without a record, or on the door for the very model the reader came from", () => {
    expect(doorBack(null, ["fast"], "instant")).toBeNull();
    expect(doorBack({ to: "/vault", prev: "instant" }, ["fast"], "instant")).toBeNull();
  });
});

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
const en = JSON.parse(read("../../../../packages/i18n/locales/en.json")) as Record<string, string>;

describe("what the screens print (F445)", () => {
  it("no screen claims that choosing another model replaces the stored one", () => {
    expect(en["vault.web.explain"]).not.toMatch(/replace|one model at a time/i);
    expect(en["vault.web.explain"]).toMatch(/until you remove/);
  });
  it("the vault's tier card no longer prints the file name", () => {
    const vault = read("../screens/vault/VaultEntry.web.tsx");
    expect(vault).not.toContain("boot.source.file");
    expect(vault).not.toContain("vault.web.size");
    expect(en["vault.web.size"]).toBeUndefined();
  });
  it("an extension row says its size once: in the state line, not again on the button", () => {
    expect(read("../components/ExtensionsSection.tsx")).toContain('label: t("extensions.downloadNow")');
    expect(en["extensions.downloadNow"]).not.toMatch(/\{size\}/);
    expect(en["web.models.choose"]).not.toMatch(/\{size\}/);
  });
  it("the framed door keeps a back arrow except while bytes move, and the shell wires it to the recorded way back", () => {
    expect(read("ModelOffer.tsx")).toContain("<Header back={!busy} onBack={onBack} />");
    expect(read("WebShell.tsx")).toContain("onBack={back ? () => leaveDoor(back) : undefined}");
  });
  it("a browser that still holds a model is not a wiped one: choosing another does not restart onboarding", () => {
    const shell = read("WebShell.tsx");
    expect(shell).toContain('const holdsModel = boot.choices.some((c) => c.installed) || boot.status.kind === "partial";');
    expect(shell).toContain("useState<boolean | null>(holdsModel ? true : null)");
  });
  it("the vault offers Remove on stored models and the sheet prints the same state", () => {
    expect(read("../screens/vault/VaultEntry.web.tsx")).toContain("onRemove={(id) => void removeWebModel(id)}");
    expect(read("../components/chat/ChatModelSheet.tsx")).toContain("storedOf={browser?.stored}");
  });
});
