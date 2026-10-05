import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, findExtension, modelParts, type CatalogModel } from "@inborn/core";

/* The phone's disk: file uri → bytes, and the text of vault.json. */
const sizes = new Map<string, number>();
const texts = new Map<string, string>();
const VAULT = "file:///Documents/models";
const RECORD = `${VAULT}/vault.json`;
const BUNDLED = "file:///Inborn.app/instant.gguf";

class FakeFile {
  uri: string;
  constructor(base: string, name?: string) {
    this.uri = name ? `${base.replace(/\/$/, "")}/${name}` : base;
  }
  get exists() {
    return sizes.has(this.uri);
  }
  get size() {
    return sizes.get(this.uri) ?? 0;
  }
  textSync() {
    return texts.get(this.uri) ?? "";
  }
  write(text: string) {
    texts.set(this.uri, text);
    sizes.set(this.uri, text.length);
  }
}

const byId = (id: string) => BUNDLED_MANIFEST.models.find((m) => m.id === id) as CatalogModel;
const fast = byId("fast");
const instant = byId("instant");
const embed = byId("embed-e5");
const inVault = (m: CatalogModel) => `${VAULT}/${m.file}`;

vi.mock("expo-file-system", () => ({ File: FakeFile }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../src/vault/playDelivery", () => ({ PlayDelivery: class {} }));
vi.mock("../src/vault/httpsDelivery", () => ({
  HttpsDelivery: class {
    plan = (model: CatalogModel) => ({ via: "https" as const, origin: "models.inborn.app", bytes: model.bytes });
    locate = (model: CatalogModel) => (sizes.has(inVault(model)) ? inVault(model) : null);
    deliver = async () => {
      throw new Error("offline");
    };
    pause = async () => undefined;
    cancel = async () => undefined;
    remove = async () => undefined;
  },
  NoSpaceError: class extends Error {},
  PausedError: class extends Error {},
  DEV_MODEL_HOSTS: [] as string[],
}));
vi.mock("../src/vault/paths", () => ({
  bundledModelFile: (id: string) => (id === "instant" && sizes.has(BUNDLED) ? new FakeFile(BUNDLED) : null),
  devFallbackFile: () => new FakeFile("file:///Documents/instant.gguf"),
  fileSize: (f: FakeFile) => (f.exists ? f.size : 0),
  modelFile: (name: string) => new FakeFile(VAULT, name),
  recordFile: () => new FakeFile(RECORD),
  safeDelete: (f: FakeFile) => void sizes.delete(f.uri),
  vaultDir: () => ({ list: () => [], uri: VAULT }),
}));
vi.mock("../src/vault/device", () => ({ readDevice: () => ({ os: "ios", chip: "high", ramGB: 8 }), freeDiskBytes: () => 64 * 1024 ** 3 }));
vi.mock("../src/vault/hash", () => ({
  fileGgufHeader: async () => null,
  fileSha256: async (f: FakeFile) => (f.uri === BUNDLED ? instant.sha256 : (BUNDLED_MANIFEST.models.flatMap(modelParts).find((p) => f.uri.endsWith(`/${p.file}`))?.sha256 ?? "")),
}));
vi.mock("../src/vault/devFlags", () => ({ DEV_MODELS_BASE_URL: undefined, devBuild: () => false }));
vi.mock("../src/vault/network", () => ({ networkKind: async () => "wifi" }));
vi.mock("../src/services/storageFull", () => ({ reportStorageFull: () => undefined }));

const { VaultStore, getVault } = await import("../src/vault/store");
const { readRecord } = await import("../src/vault/record");
const { extensionState } = await import("../src/extensions/store.native");
const { holdView } = await import("../src/extensions/card");

const settled = () => new Promise((r) => setTimeout(r, 0));
const onDisk = () => JSON.parse(texts.get(RECORD) ?? "null") as { defaultModelId?: string; installs: Record<string, unknown> } | null;

/* The founder's phone before the wipe: Instant in the app, Fast and the document index downloaded, Fast the default. */
function yesterday(): void {
  sizes.clear();
  texts.clear();
  sizes.set(BUNDLED, instant.bytes);
  for (const m of [fast, embed]) sizes.set(inVault(m), m.bytes);
  const rec = (m: CatalogModel) => ({ file: m.file, bytes: m.bytes, sha256: m.sha256, via: "https", installedAt: 1 });
  new FakeFile(RECORD).write(JSON.stringify({ version: 1, defaultModelId: "fast", installs: { fast: rec(fast), "embed-e5": rec(embed) }, imports: {}, hf: {}, downloads: {} }));
}

/* Settings › Erase everything: the "also delete models" toggle takes the whole Documents/models directory with it. */
function wipeDisk(models: boolean): void {
  if (!models) return;
  for (const uri of [...sizes.keys()]) if (uri.startsWith(`${VAULT}/`)) sizes.delete(uri);
  texts.delete(RECORD);
}

async function booted() {
  const vault = new VaultStore();
  await vault.ready();
  await settled();
  return vault;
}

beforeEach(yesterday);

describe("round 129 · Erase everything leaves the vault's memory equal to the disk", () => {
  it("the bug: without a rescan the vault still says Fast is ready and writes it back into a new vault.json", async () => {
    const vault = await booted();
    wipeDisk(true);
    expect(vault.state("fast").kind).toBe("ready");
    vault.setDefault("fast");
    expect(Object.keys(onDisk()!.installs)).toEqual(expect.arrayContaining(["fast", "embed-e5"]));
  });

  it("with models: Fast and the index model are not installed, the default falls back to Instant, nothing stale is written", async () => {
    const vault = await booted();
    wipeDisk(true);
    await vault.rescan();
    expect(vault.state("fast").kind).toBe("not-installed");
    expect(vault.state("embed-e5").kind).toBe("not-installed");
    expect(vault.state("instant")).toMatchObject({ kind: "ready", via: "bundled" });
    expect(vault.defaultModelId()).toBe("instant");
    expect(vault.activeModel()?.model.id).toBe("instant");
    expect(Object.keys(onDisk()!.installs)).toEqual(["instant"]);
    expect(onDisk()!.defaultModelId).toBe("instant");
  });

  it("without models: the kept files and record stay installed, Fast stays the default", async () => {
    const vault = await booted();
    wipeDisk(false);
    await vault.rescan();
    expect(vault.state("fast")).toMatchObject({ kind: "ready", path: inVault(fast) });
    expect(vault.state("embed-e5").kind).toBe("ready");
    expect(vault.defaultModelId()).toBe("fast");
    expect(vault.activeModel()?.model.id).toBe("fast");
  });

  it("an empty record read twice does not share its maps, so a wipe cannot bring back an earlier run's installs", () => {
    texts.delete(RECORD);
    sizes.delete(RECORD);
    const first = readRecord();
    first.installs.fast = { file: fast.file, bytes: 1, sha256: "", via: "https", installedAt: 1 };
    expect(readRecord().installs).toEqual({});
  });

  it("AppServices rescans the vault and drops the engine right after the wipe, before the next boot", () => {
    const src = readFileSync(join(__dirname, "../src/services/AppServices.tsx"), "utf8");
    const body = src.slice(src.indexOf("const wipeAll"), src.indexOf("const lock = useAppLock"));
    const order = ["await wipe(opts)", "await getVault().rescan()", "forgetExtensions()", "await resetEngine()", "setGeneration("].map((s) => body.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("round 129 · a model file gone at use time heals the vault", () => {
  it("a ready Fast whose file is gone becomes not-installed, its record dropped and persisted, and the chat runs on Instant", async () => {
    const vault = await booted();
    sizes.delete(inVault(fast));
    expect(vault.activeModel()?.model.id).toBe("instant");
    expect(vault.state("fast").kind).toBe("not-installed");
    expect(onDisk()!.installs.fast).toBeUndefined();
    expect(vault.defaultModelId()).toBe("instant");
    expect(vault.missingModel()).toBe("fast");
    expect(vault.takeMissing()).toBe("fast");
    expect(vault.takeMissing()).toBeNull();
  });

  it("listeners hear about it after the read that found it, never during it", async () => {
    const vault = await booted();
    const heard = vi.fn();
    vault.subscribe(heard);
    sizes.delete(inVault(fast));
    expect(vault.forgetMissing("fast")).toBe(true);
    expect(heard).not.toHaveBeenCalled();
    await settled();
    expect(heard).toHaveBeenCalled();
  });

  it("the news stays until it is dismissed, so a chat remounted twice by the swap still shows it", async () => {
    const vault = await booted();
    sizes.delete(inVault(fast));
    vault.activeModel();
    expect(vault.missingModel()).toBe("fast");
    expect(vault.missingModel()).toBe("fast");
    const heard = vi.fn();
    vault.subscribe(heard);
    vault.takeMissing();
    expect(heard).toHaveBeenCalled();
    expect(vault.missingModel()).toBeNull();
  });

  it("a file still on disk, and Instant inside the app, are never forgotten", async () => {
    const vault = await booted();
    expect(vault.forgetMissing("fast")).toBe(false);
    expect(vault.forgetMissing("instant")).toBe(false);
    expect(vault.missingModel()).toBeNull();
  });

  it("a load that throws keeps the model's last good load time", async () => {
    const vault = await booted();
    vault.markLoading("fast", true);
    vault.markLoading("fast", false, false);
    const rec = onDisk()!.installs.fast as { loading?: boolean; lastLoadedAt?: number };
    expect(rec.loading).toBe(false);
    expect(rec.lastLoadedAt).toBeUndefined();
  });

  it("the chat says the model is gone in its own words and falls back, instead of the raw engine error", () => {
    const chat = readFileSync(join(__dirname, "../src/screens/Chat.tsx"), "utf8");
    expect(chat).toContain('t("chat.modelMissing"');
    expect(chat).toMatch(/vault\.forgetMissing\(model\.id\)/);
    expect(chat).toMatch(/onSwitchModel\?\.\(back\)/);
    expect(chat).toContain("useSyncExternalStore(subscribeVault, missingSnapshot)");
    const en = JSON.parse(readFileSync(join(__dirname, "../../../packages/i18n/locales/en.json"), "utf8")) as Record<string, string>;
    expect(en["chat.modelMissing"]).toBe("{model} is no longer on this {device}. Download it again in the vault.");
  });
});

describe("round 129 · the document hold card follows the same truth as the library", () => {
  it("a ready index model whose file is gone shows the Download offer, never 'Downloading… 100%'", async () => {
    const vault = getVault();
    await vault.ready();
    expect(extensionState("embed-e5")).toMatchObject({ kind: "ready" });
    sizes.delete(inVault(embed));
    const state = extensionState("embed-e5");
    expect(state).toEqual({ kind: "missing", bytes: embed.bytes });
    const view = holdView(findExtension("embed-e5")!, state, { count: 1, size: "468 MB" });
    expect(view.download).toEqual({ key: "extensions.download", params: { size: "468 MB" } });
    expect(view.body.params).not.toHaveProperty("pct");
  });
});
