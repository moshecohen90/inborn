import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, transition, NOT_INSTALLED, type CatalogModel, type InstallEvent, type InstallState, type NetworkKind } from "@inborn/core";

/* Round 130: Airplane Mode before the tap and in the middle of a transfer. A task here runs until it is told to finish or pause. */
const disk = new Map<string, number>();
const heads: string[] = [];
const legs: { from: "start" | "resume"; resumeData?: string }[] = [];
let finishLeg: (() => void) | null = null;

class FakeFile {
  constructor(public uri: string) {}
  get exists() {
    return disk.has(this.uri);
  }
  get size() {
    return disk.get(this.uri) ?? 0;
  }
  delete() {
    disk.delete(this.uri);
  }
  async move(dest: FakeFile) {
    disk.set(dest.uri, this.size);
    disk.delete(this.uri);
  }
  static createDownloadTask(url: string, file: FakeFile, opts: { onProgress?: (p: { bytesWritten: number }) => void }) {
    return task(url, file, opts, "idle");
  }
}

function task(url: string, file: FakeFile, opts: { onProgress?: (p: { bytesWritten: number }) => void }, state: string, resumeData?: string) {
  let settle: ((v: { uri: string } | null) => void) | null = null;
  const t = {
    state,
    run(from: "start" | "resume") {
      t.state = "active";
      legs.push({ from, ...(resumeData ? { resumeData } : {}) });
      opts.onProgress?.({ bytesWritten: HALF });
      return new Promise<{ uri: string } | null>((resolve) => {
        settle = resolve;
        finishLeg = () => {
          disk.set(file.uri, TOTAL);
          t.state = "completed";
          resolve({ uri: file.uri });
        };
      });
    },
    downloadAsync: () => t.run("start"),
    resumeAsync: () => t.run("resume"),
    async pauseAsync() {
      t.state = "paused";
      settle?.(null);
    },
    savable: () => ({ url, fileUri: file.uri, isDirectory: false, resumeData: "rd-at-half" }),
    cancel() {
      t.state = "cancelled";
    },
  };
  return t;
}

vi.mock("expo-file-system", () => ({
  File: FakeFile,
  DownloadTask: {
    fromSavable: (saved: { url: string; fileUri: string; resumeData?: string }, opts: { onProgress?: (p: { bytesWritten: number }) => void }) => task(saved.url, new FakeFile(saved.fileUri), opts, "paused", saved.resumeData),
  },
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) } }));
vi.mock("../licence/devFlags", () => ({ devBuild: () => true }));
vi.mock("./devFlags", () => ({ DEV_MODEL_HOST: undefined, devBuild: () => false }));
vi.mock("./hf", () => ({ hfHeaders: async () => ({}), hfSearchAvailable: () => false }));
vi.mock("../proof/transfers", () => ({ recordTransfer: () => undefined }));
vi.mock("./paths", () => ({
  modelFile: (name: string) => new FakeFile(`/vault/${name}`),
  partialFile: (name: string) => new FakeFile(`/vault/${name}.part`),
  fileSize: (f: FakeFile) => (f.exists ? f.size : 0),
  safeDelete: (f: FakeFile) => f.delete(),
}));

const { HttpsDelivery } = await import("./httpsDelivery");
const model = BUNDLED_MANIFEST.models.find((m) => m.id === "embed-e5") as CatalogModel;
const TOTAL = model.bytes;
const HALF = Math.floor(TOTAL / 2);
const FINAL = `/vault/${model.file}`;

/** A network the test moves by hand; listeners hear each move, as NWPathMonitor's would. */
function setup(options: { wifiOnly?: boolean; network: NetworkKind }) {
  const saved = new Map<string, unknown>();
  const listeners = new Set<(k: NetworkKind) => void>();
  const net = {
    kind: options.network,
    set(k: NetworkKind) {
      net.kind = k;
      for (const l of listeners) l(k);
    },
  };
  const d = new HttpsDelivery(
    {
      manifest: BUNDLED_MANIFEST,
      wifiOnly: () => options.wifiOnly ?? false,
      network: async () => net.kind,
      onNetworkChange: (l) => {
        listeners.add(l);
        return () => void listeners.delete(l);
      },
      savedDownload: (id: string) => saved.get(id),
      saveDownload: (id: string, s: unknown) => (s === null ? saved.delete(id) : saved.set(id, s)),
    },
    10_000,
  );
  let state: InstallState = transition(NOT_INSTALLED, { type: "request", via: "https", requiredBytes: 1, freeBytes: 2 });
  const events: string[] = [];
  const emit = (e: InstallEvent) => {
    events.push(e.type);
    state = transition(state, e);
  };
  return { d, net, events, emit, state: () => state };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  disk.clear();
  heads.length = 0;
  legs.length = 0;
  finishLeg = null;
  vi.stubGlobal("fetch", async (url: string) => {
    heads.push(url);
    return new Response(null, { status: 200, headers: { "content-length": String(TOTAL), "accept-ranges": "bytes", etag: '"e1"' } });
  });
});

describe("a download tapped with no connection (round 130)", () => {
  it("waits as 'no connection', not as 'Wi-Fi', fetches nothing, and starts by itself the moment a path is back", async () => {
    const { d, net, events, emit, state } = setup({ network: "none" });
    const done = d.deliver(model, emit);
    await tick();
    expect(events).toEqual(["waiting-for-network"]);
    expect(state()).toMatchObject({ kind: "delivering", waitingForNetwork: true, waitingForWifi: false });
    expect(heads).toEqual([]);
    net.set("wifi");
    await tick();
    await tick();
    expect(legs).toEqual([{ from: "start" }]);
    expect(state()).toMatchObject({ waitingForNetwork: false });
    finishLeg!();
    expect(await done).toBe(FINAL);
  });

  it("Wi-Fi only is unchanged: cellular says 'waiting for Wi-Fi', and a path that goes from none to cellular moves to that wait", async () => {
    const { d, net, events, emit, state } = setup({ network: "none", wifiOnly: true });
    const done = d.deliver(model, emit);
    await tick();
    net.set("cellular");
    await tick();
    await tick();
    expect(events).toEqual(["waiting-for-network", "waiting-for-wifi"]);
    expect(state()).toMatchObject({ waitingForWifi: true, waitingForNetwork: false });
    expect(heads).toEqual([]);
    net.set("wifi");
    await tick();
    await tick();
    finishLeg!();
    expect(await done).toBe(FINAL);
  });

  it("Cancel while waiting for a connection ends the wait with nothing fetched", async () => {
    const { d, emit } = setup({ network: "none" });
    const done = d.deliver(model, emit).catch((e: unknown) => (e as Error).message);
    await tick();
    await d.cancel(model);
    expect(await done).toBe("paused");
    expect(heads).toEqual([]);
    expect(legs).toEqual([]);
  });
});

describe("the connection lost in the middle of a download (round 130)", () => {
  it("parks the transfer with its resume data, says it is waiting, and continues from the same byte when the path is back", async () => {
    const { d, net, events, emit, state } = setup({ network: "wifi" });
    const done = d.deliver(model, emit);
    await tick();
    await tick();
    expect(legs).toEqual([{ from: "start" }]);
    net.set("none");
    await tick();
    await tick();
    expect(state()).toMatchObject({ kind: "delivering", waitingForNetwork: true, bytes: HALF });
    net.set("wifi");
    await tick();
    await tick();
    /* One HEAD for the whole download: the second leg is the platform's resume data, not a new request from byte 0. */
    expect(legs).toEqual([{ from: "start" }, { from: "resume", resumeData: "rd-at-half" }]);
    expect(heads).toHaveLength(1);
    expect(events).toContain("resumed");
    expect(state()).toMatchObject({ waitingForNetwork: false });
    finishLeg!();
    expect(await done).toBe(FINAL);
  });

  it("Cancel while parked on a lost connection ends it and keeps no part", async () => {
    const { d, net, emit } = setup({ network: "wifi" });
    const done = d.deliver(model, emit).catch((e: unknown) => (e as Error).message);
    await tick();
    await tick();
    net.set("none");
    await tick();
    await d.cancel(model);
    expect(await done).toBe("paused");
    expect(disk.has(`${FINAL}.part`)).toBe(false);
  });
});
