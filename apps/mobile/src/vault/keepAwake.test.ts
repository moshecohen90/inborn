import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, DeliveryLanes, type CatalogModel, type InstallEvent } from "@inborn/core";
import type { VaultRecord } from "./record";

/*
 * Round 91: iOS parks an in-process download when the app leaves the screen (F370), and auto-lock backgrounds the app
 * after 30 s to 2 min. These tests pin that the screen stays awake exactly while bytes move, across concurrent downloads.
 */

const os = vi.hoisted(() => ({ OS: "ios" }));
const calls = vi.hoisted(() => [] as string[]);
vi.mock("react-native", () => ({ Platform: os }));
vi.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: async (tag: string) => void calls.push(`on:${tag}`),
  deactivateKeepAwake: async (tag: string) => void calls.push(`off:${tag}`),
}));

type Leg = { id: string; emit: (e: InstallEvent) => void; finish: () => void; fail: (e: Error) => void };
const legs = new Map<string, Leg>();
let record: VaultRecord;
const sizes = new Map<string, number>();

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
}
vi.mock("expo-file-system", () => ({ File: FakeFile }));
vi.mock("./playDelivery", () => ({ PlayDelivery: class {} }));
vi.mock("./httpsDelivery", () => {
  class PausedError extends Error {}
  return {
    PausedError,
    NoSpaceError: class extends Error {},
    DEV_MODEL_HOSTS: [] as string[],
    HttpsDelivery: class {
      plan = (model: CatalogModel) => ({ via: "https" as const, origin: "models.inbornapp.com", bytes: model.bytes });
      locate = () => null;
      deliver = (model: CatalogModel, emit: (e: InstallEvent) => void) =>
        new Promise<string>((resolve, reject) => {
          legs.set(model.id, {
            id: model.id,
            emit,
            finish: () => {
              sizes.set(`file:///vault/${model.file}`, model.bytes);
              resolve(`file:///vault/${model.file}`);
            },
            fail: reject,
          });
        });
      pause = async (model: CatalogModel) => legs.get(model.id)?.fail(new PausedError("paused"));
      cancel = async (model: CatalogModel) => legs.get(model.id)?.fail(new Error("canceled"));
      remove = async () => undefined;
    },
  };
});
vi.mock("./record", () => ({ readRecord: () => record, writeRecord: (r: VaultRecord) => void (record = r) }));
vi.mock("./paths", () => ({
  bundledModelFile: () => null,
  devFallbackFile: () => new FakeFile("file:///doc/instant.gguf"),
  fileSize: (f: FakeFile) => (f.exists ? f.size : 0),
  modelFile: (name: string) => new FakeFile(`file:///vault/${name}`),
  safeDelete: () => undefined,
  vaultDir: () => ({ list: () => [] }),
}));
vi.mock("./device", () => ({ readDevice: () => ({ os: "ios", chip: "high", ramGB: 6 }), freeDiskBytes: () => 64 * 1024 ** 3 }));
vi.mock("./hash", () => ({ fileGgufHeader: async () => null, fileSha256: async () => "0".repeat(64) }));
vi.mock("./devFlags", () => ({ DEV_MODELS_BASE_URL: undefined, devBuild: () => false }));
vi.mock("./network", () => ({ networkKind: async () => "wifi" }));
vi.mock("../services/storageFull", () => ({ reportStorageFull: () => undefined }));

const { VaultStore } = await import("./store");
const { DownloadAwake, DOWNLOAD_AWAKE_TAG, downloadAwake } = await import("./keepAwake");

const ON = `on:${DOWNLOAD_AWAKE_TAG}`;
const OFF = `off:${DOWNLOAD_AWAKE_TAG}`;
const settled = () => new Promise((r) => setTimeout(r, 0));
/* The native module loads on first use, so its calls land a few ticks after the event. */
const native = async (): Promise<string[]> => {
  for (let i = 0; i < 5; i++) await settled();
  return [...calls];
};
/* One large and one small model: the lanes run them side by side (one large lane, two small ones). */
const fetchable = BUNDLED_MANIFEST.models.filter((m) => !m.delivery.some((d) => d.kind === "bundled"));
const a = fetchable.find((m) => DeliveryLanes.isLarge(m.bytes)) as CatalogModel;
const b = fetchable.find((m) => !DeliveryLanes.isLarge(m.bytes)) as CatalogModel;
const tick = (id: string, bytes = 10) => legs.get(id)?.emit({ type: "progress", bytes, total: 100 });

/* Wrapped: an async function returning the install promise would wait for the whole download. */
async function started(vault: InstanceType<typeof VaultStore>, id: string): Promise<{ run: Promise<unknown> }> {
  const run = vault.install(id);
  await settled();
  tick(id);
  return { run };
}

beforeEach(async () => {
  os.OS = "ios";
  /* The hold is app-wide; a download a previous test left running must not count here. */
  downloadAwake.releaseAll();
  await native();
  calls.length = 0;
  legs.clear();
  sizes.clear();
  record = { version: 1, installs: {}, imports: {}, hf: {}, downloads: {} };
});

describe("keep-awake while a model downloads (round 91)", () => {
  it("holds the screen awake from the first bytes of the first download", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await started(vault, a.id);
    expect(await native()).toEqual([ON]);
  });

  it("lets go only when the last of two concurrent downloads ends", async () => {
    const vault = new VaultStore();
    await vault.ready();
    const { run: runA } = await started(vault, a.id);
    const { run: runB } = await started(vault, b.id);
    expect(await native()).toEqual([ON]);
    legs.get(a.id)?.finish();
    await runA;
    expect(await native()).toEqual([ON]);
    legs.get(b.id)?.finish();
    await runB;
    expect(await native()).toEqual([ON, OFF]);
  });

  it("lets go on Cancel", async () => {
    const vault = new VaultStore();
    await vault.ready();
    const { run } = await started(vault, a.id);
    await vault.cancel(a.id);
    await run;
    expect(vault.state(a.id).kind).toBe("not-installed");
    expect(await native()).toEqual([ON, OFF]);
  });

  it("lets go on Pause", async () => {
    const vault = new VaultStore();
    await vault.ready();
    const { run } = await started(vault, a.id);
    await vault.pause(a.id);
    await run;
    expect(await native()).toEqual([ON, OFF]);
  });

  it("lets go when the download fails", async () => {
    const vault = new VaultStore();
    await vault.ready();
    const { run } = await started(vault, a.id);
    legs.get(a.id)?.fail(new Error("network lost"));
    await run;
    expect(vault.state(a.id).kind).toBe("failed");
    expect(await native()).toEqual([ON, OFF]);
  });

  it("lets the screen sleep while the download waits for Wi-Fi, and holds again when bytes move", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await started(vault, a.id);
    legs.get(a.id)?.emit({ type: "waiting-for-wifi" });
    tick(a.id, 20);
    expect(await native()).toEqual([ON, OFF, ON]);
  });

  it("releaseAll (unmount) lets go of every hold at once", () => {
    const native = { activate: vi.fn(async () => undefined), deactivate: vi.fn(async () => undefined) };
    const awake = new DownloadAwake(native);
    awake.hold("x");
    awake.hold("y");
    awake.releaseAll();
    expect(native.activate).toHaveBeenCalledTimes(1);
    expect(native.deactivate).toHaveBeenCalledTimes(1);
    expect(awake.active).toBe(false);
  });

  it("never touches keep-awake on the web", async () => {
    os.OS = "web";
    vi.resetModules();
    const { downloadAwake } = await import("./keepAwake");
    downloadAwake.onEvent("x", { type: "progress", bytes: 1, total: 2 });
    expect(downloadAwake.active).toBe(false);
    expect(await native()).toEqual([]);
  });

  it("the parked iOS download that continues on return says so", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await started(vault, a.id);
    legs.get(a.id)?.emit({ type: "resumed", at: 1234 });
    expect(vault.state(a.id)).toMatchObject({ kind: "delivering", paused: false, resumedAt: 1234 });
  });
});
