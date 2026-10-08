import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, type CatalogModel, type NetworkKind } from "@inborn/core";
import type { VaultRecord } from "./record";

/* Round 130: a transfer that fails for want of a connection waits for one and goes again by itself, on any delivery. */
const embed = BUNDLED_MANIFEST.models.find((m) => m.id === "embed-e5") as CatalogModel;
const PATH = `file:///vault/${embed.file}`;
let record: VaultRecord;
const sizes = new Map<string, number>();
/** What each successive deliver() does: throw this text, or land the file. */
let legs: (string | "ok")[] = [];
let calls = 0;
const net = { kind: "wifi" as NetworkKind, listeners: new Set<(k: NetworkKind) => void>() };
const setNet = (k: NetworkKind) => {
  net.kind = k;
  for (const l of net.listeners) l(k);
};

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
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("./playDelivery", () => ({
  PlayDelivery: class {
    plan = (model: CatalogModel) => ({ via: "play" as const, origin: "Google Play", bytes: model.bytes });
    locate = () => null;
    deliver = async () => {
      const leg = legs[calls++] ?? "ok";
      if (leg !== "ok") throw new Error(leg);
      sizes.set(PATH, embed.bytes);
      return PATH;
    };
    pause = async () => undefined;
    cancel = async () => undefined;
    remove = async () => undefined;
  },
}));
vi.mock("./httpsDelivery", () => ({ HttpsDelivery: class {}, NoSpaceError: class extends Error {}, PausedError: class extends Error {}, DEV_MODEL_HOSTS: [] as string[], WIFI_POLL_MS: 60_000 }));
vi.mock("./record", () => ({ readRecord: () => record, writeRecord: (r: VaultRecord) => void (record = r) }));
vi.mock("./paths", () => ({
  bundledModelFile: () => null,
  devFallbackFile: () => new FakeFile("file:///doc/instant.gguf"),
  fileSize: (f: FakeFile) => (f.exists ? f.size : 0),
  modelFile: (name: string) => new FakeFile(`file:///vault/${name}`),
  safeDelete: () => undefined,
  vaultDir: () => ({ list: () => [] }),
}));
vi.mock("./device", () => ({ readDevice: () => ({ os: "android", chip: "mid" }), freeDiskBytes: () => 64 * 1024 ** 3 }));
vi.mock("./hash", () => ({ fileGgufHeader: async () => null, fileSha256: async () => embed.sha256 }));
vi.mock("./devFlags", () => ({ DEV_MODELS_BASE_URL: undefined, devBuild: () => false }));
vi.mock("./network", () => ({
  networkKind: async () => net.kind,
  onNetworkChange: (l: (k: NetworkKind) => void) => {
    net.listeners.add(l);
    return () => void net.listeners.delete(l);
  },
}));
vi.mock("../services/storageFull", () => ({ reportStorageFull: () => undefined }));

const { VaultStore } = await import("./store");

const tick = async (n = 4) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(async () => {
  record = { version: 1, installs: {}, imports: {}, hf: {}, downloads: {} };
  sizes.clear();
  legs = [];
  calls = 0;
  net.kind = "wifi";
  net.listeners.clear();
});
afterEach(() => vi.useRealTimers());

async function vault() {
  const v = new VaultStore();
  await v.ready();
  await tick();
  calls = 0;
  return v;
}

describe("VaultStore across a lost connection (round 130)", () => {
  it("a transfer dropped by Airplane Mode waits for a connection, then goes again by itself and lands: no Try again", async () => {
    const v = await vault();
    legs = ["Unable to download a file: The network connection was lost."];
    net.kind = "none";
    const done = v.install("embed-e5");
    await tick();
    expect(v.state("embed-e5")).toMatchObject({ kind: "delivering", waitingForNetwork: true });
    expect(calls).toBe(1);
    setNet("wifi");
    expect(await done).toMatchObject({ kind: "ready" });
    expect(calls).toBe(2);
  });

  it("Cancel while it waits ends the download, and nothing goes again when the connection returns", async () => {
    const v = await vault();
    legs = ["network"];
    net.kind = "none";
    const done = v.install("embed-e5");
    await tick();
    await v.cancel("embed-e5");
    expect(await done).toEqual({ kind: "not-installed" });
    setNet("wifi");
    await tick();
    expect(calls).toBe(1);
  });

  it("a path that says it is up but keeps dropping is retried with backoff, then reported with the offline line", async () => {
    const v = await vault();
    vi.useFakeTimers();
    legs = ["Network request failed", "Network request failed", "Network request failed", "Network request failed"];
    const done = v.install("embed-e5");
    await vi.advanceTimersByTimeAsync(2_000 + 4_000 + 8_000 + 100);
    const end = await done;
    expect(calls).toBe(4);
    expect(end).toMatchObject({ kind: "failed", error: "Network request failed", retryable: true });
  });

  it("an error that is not the connection fails at once, as before", async () => {
    const v = await vault();
    legs = ["size mismatch: host says 1 bytes, catalog 2"];
    expect(await v.install("embed-e5")).toMatchObject({ kind: "failed" });
    expect(calls).toBe(1);
  });
});
