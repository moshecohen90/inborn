import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, type CatalogModel } from "@inborn/core";

/*
 * F370: on iOS nsurlsessiond paced the app's background-session download at 0.09 MB/s on the iPhone 13 Pro and
 * 0.095 MB/s on the simulator while the same app's in-process session moved the pack at ~40 MB/s. These tests pin the
 * iOS contract: in-process session while the app is on screen, parked with its resume data when it leaves.
 */

type Opts = { sessionType?: string; onProgress?: (p: { bytesWritten: number }) => void };
type Leg = { url: string; kind: "fresh" | "resume"; sessionType?: string; resumeData?: string; finish: () => void; paused: boolean };

const disk = new Map<string, number>();
const legs: Leg[] = [];
let listeners: ((s: string) => void)[] = [];
const appState = { currentState: "active" };

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
  move(dest: FakeFile) {
    disk.set(dest.uri, this.size);
    disk.delete(this.uri);
    return Promise.resolve();
  }
  static createDownloadTask(url: string, file: FakeFile, opts: Opts) {
    return fakeTask(url, file, "fresh", opts);
  }
}

/** A task the test finishes by hand; `pauseAsync` resolves the running leg with null, as expo-file-system does. */
function fakeTask(url: string, file: FakeFile, kind: "fresh" | "resume", opts: Opts, resumeData?: string) {
  let settle: (v: { uri: string } | null) => void = () => undefined;
  const task = {
    state: kind === "resume" ? "paused" : "idle",
    run() {
      task.state = "active";
      return new Promise<{ uri: string } | null>((resolve) => {
        settle = resolve;
        const leg: Leg = {
          url,
          kind,
          sessionType: opts.sessionType,
          resumeData,
          paused: false,
          finish: () => {
            disk.set(file.uri, TOTAL);
            opts.onProgress?.({ bytesWritten: TOTAL });
            task.state = "finished";
            resolve({ uri: file.uri });
          },
        };
        legs.push(leg);
      });
    },
    downloadAsync() {
      return task.run();
    },
    resumeAsync() {
      return task.run();
    },
    async pauseAsync() {
      const leg = legs[legs.length - 1];
      if (leg) leg.paused = true;
      task.state = "paused";
      settle(null);
    },
    savable: () => ({ url, fileUri: file.uri, isDirectory: false, resumeData: `resume-${legs.length}` }),
    cancel() {},
  };
  return task;
}

vi.mock("expo-file-system", () => ({
  File: FakeFile,
  DownloadTask: {
    fromSavable: (saved: { url: string; fileUri: string; resumeData?: string }, opts: Opts) => fakeTask(saved.url, new FakeFile(saved.fileUri), "resume", opts, saved.resumeData),
  },
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: {
    get currentState() {
      return appState.currentState;
    },
    addEventListener: (_: "change", fn: (s: string) => void) => {
      listeners.push(fn);
      return { remove: () => (listeners = listeners.filter((l) => l !== fn)) };
    },
  },
}));
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
const model = BUNDLED_MANIFEST.models.find((m) => m.id === "vision-qwen35") as CatalogModel;
const TOTAL = model.bytes;
const FINAL = `/vault/${model.file}`;
const settle = () => new Promise((r) => setTimeout(r, 10));

function goTo(state: "active" | "inactive" | "background") {
  appState.currentState = state;
  for (const l of [...listeners]) l(state);
}

function delivery() {
  const saved = new Map<string, unknown>();
  const ctx = {
    manifest: BUNDLED_MANIFEST,
    wifiOnly: () => false,
    network: async () => "wifi" as const,
    savedDownload: (id: string) => saved.get(id),
    saveDownload: (id: string, s: unknown) => (s === null ? saved.delete(id) : saved.set(id, s)),
  };
  return { d: new HttpsDelivery(ctx, 1), saved };
}

beforeEach(() => {
  disk.clear();
  legs.length = 0;
  listeners = [];
  appState.currentState = "active";
  vi.stubGlobal("fetch", async () => new Response(null, { status: 200, headers: { "content-length": String(TOTAL), "accept-ranges": "bytes", etag: '"e1"' } }));
});

describe("iOS model downloads run in the app's own URLSession (F370)", () => {
  it("asks expo-file-system for the foreground session, not nsurlsessiond's background one", async () => {
    const { d } = delivery();
    const done = d.deliver(model, () => undefined);
    await settle();
    expect(legs.map((l) => l.sessionType)).toEqual(["foreground"]);
    legs[0]?.finish();
    expect(await done).toBe(FINAL);
    expect(disk.get(FINAL)).toBe(TOTAL);
  });

  it("parks the transfer with its resume data when the app leaves the screen, and continues from it on return", async () => {
    const { d, saved } = delivery();
    const done = d.deliver(model, () => undefined);
    await settle();
    goTo("inactive");
    await settle();
    expect(legs[0]?.paused).toBe(false);
    goTo("background");
    await settle();
    expect(legs[0]?.paused).toBe(true);
    expect((saved.get(model.id) as { resumeData?: string } | undefined)?.resumeData).toBe("resume-1");
    expect(legs).toHaveLength(1);
    goTo("active");
    await settle();
    expect(legs).toHaveLength(2);
    expect(legs[1]).toMatchObject({ kind: "resume", resumeData: "resume-1", sessionType: "foreground" });
    legs[1]?.finish();
    expect(await done).toBe(FINAL);
    expect(saved.size).toBe(0);
  });

  it("a Pause pressed while parked ends as a pause and keeps the resume data", async () => {
    const { d, saved } = delivery();
    const done = d.deliver(model, () => undefined).catch((e: unknown) => (e as Error).message);
    await settle();
    goTo("background");
    await settle();
    await d.pause(model);
    expect(await done).toBe("paused");
    expect((saved.get(model.id) as { resumeData?: string } | undefined)?.resumeData).toBe("resume-1");
  });

  it("a Pause pressed on screen is still a pause, not a park", async () => {
    const { d } = delivery();
    const done = d.deliver(model, () => undefined).catch((e: unknown) => (e as Error).message);
    await settle();
    await d.pause(model);
    expect(await done).toBe("paused");
    goTo("background");
    goTo("active");
    await settle();
    expect(legs).toHaveLength(1);
  });

  it("does not open a connection while the app is in the background: it waits for the screen", async () => {
    const { d } = delivery();
    appState.currentState = "background";
    const done = d.deliver(model, () => undefined);
    await settle();
    expect(legs).toHaveLength(0);
    goTo("active");
    await settle();
    expect(legs).toHaveLength(1);
    legs[0]?.finish();
    expect(await done).toBe(FINAL);
  });
});
