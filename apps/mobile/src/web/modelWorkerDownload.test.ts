import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
// The shipped worker itself (apps/mobile/public/model-worker.js), not a copy of it.
import { awaitPublished, download, metaName, stateName } from "../../public/model-worker.js";
import { modelStatus, readyModelStatus } from "./opfs";

/**
 * A fake Origin Private File System with the one property that matters for F22: a file's bytes become visible to
 * `getFile()` only when its sync access handle is closed. Chromium behaves this way, which is why the download worker
 * must close the model file before the meta file claims it is ready and before the main thread looks.
 */
class FakeFile {
  written = new Uint8Array(0);
  visible = new Uint8Array(0);
}

class FakeAccess {
  constructor(
    private readonly file: FakeFile,
    private readonly log: string[],
    private readonly name: string,
  ) {}
  getSize(): number {
    return this.file.written.length;
  }
  read(into: Uint8Array, { at }: { at: number }): number {
    const slice = this.file.written.subarray(at, at + into.length);
    into.set(slice, 0);
    return slice.length;
  }
  write(bytes: Uint8Array, { at }: { at: number }): number {
    const end = at + bytes.length;
    if (end > this.file.written.length) {
      const grown = new Uint8Array(end);
      grown.set(this.file.written, 0);
      this.file.written = grown;
    }
    this.file.written.set(bytes, at);
    return bytes.length;
  }
  truncate(n: number): void {
    this.file.written = this.file.written.slice(0, n);
  }
  flush(): void {
    /* A flush persists the bytes but not the size another context reads; only close() publishes that. */
  }
  close(): void {
    this.file.visible = this.file.written.slice();
    this.log.push(`close:${this.name}`);
  }
}

function fakeStorage(log: string[]) {
  const files = new Map<string, FakeFile>();
  const dir = {
    getFileHandle: (name: string, opts?: { create?: boolean }) => {
      let f = files.get(name);
      if (!f) {
        if (!opts?.create) return Promise.reject(new Error("NotFoundError"));
        f = new FakeFile();
        files.set(name, f);
      }
      const file = f;
      return Promise.resolve({
        createSyncAccessHandle: () => Promise.resolve(new FakeAccess(file, log, name)),
        getFile: () => Promise.resolve({ size: file.visible.length, text: () => Promise.resolve(new TextDecoder().decode(file.visible)) }),
      });
    },
    removeEntry: (name: string) => (files.delete(name) ? Promise.resolve() : Promise.reject(new Error("NotFoundError"))),
  };
  const root = { getDirectoryHandle: (name: string) => (name === "models" ? Promise.resolve(dir) : Promise.reject(new Error("NotFoundError"))) };
  return { storage: { getDirectory: () => Promise.resolve(root) }, files };
}

const body = (bytes: Uint8Array, chunk: number) => ({
  getReader: () => {
    let at = 0;
    return {
      read: () => Promise.resolve(at >= bytes.length ? { done: true, value: undefined } : { done: false, value: bytes.subarray(at, (at += chunk)) }),
    };
  },
});

const FILE = "instant.gguf";
const URL_ = "/models/instant.gguf";

afterEach(() => vi.unstubAllGlobals());

describe("model-worker download", () => {
  it("publishes the stored file before it reports done, so the door's status re-read finds it ready", async () => {
    const payload = randomBytes(300_000);
    const sha256 = createHash("sha256").update(payload).digest("hex");
    const log: string[] = [];
    const { storage } = fakeStorage(log);
    vi.stubGlobal("navigator", { storage });
    vi.stubGlobal("fetch", () => Promise.resolve({ status: 200, headers: { get: (h: string) => (h === "content-length" ? String(payload.length) : null) }, body: body(payload, 16_384) }));

    const posted: { type: string }[] = [];
    await download({ url: URL_, file: FILE, bytes: payload.length, sha256 }, (m) => {
      posted.push(m);
      log.push(`post:${m.type}`);
    }, new AbortController().signal);

    expect(posted.at(-1)).toMatchObject({ type: "done", have: payload.length, verified: true });
    /* The exact ordering F22 was about: close the model file, then write the meta, then say done. */
    expect(log.filter((l) => l === `close:${FILE}` || l === "post:done")).toEqual([`close:${FILE}`, "post:done"]);
    expect(log.indexOf(`close:${metaName(FILE)}`)).toBeGreaterThan(log.indexOf(`close:${FILE}`));
    await expect(modelStatus(FILE)).resolves.toMatchObject({ kind: "ready", meta: { bytes: payload.length, sha256, verified: true } });
  });

  it("publishes the partial file before it reports paused, so the resume state matches what is on disk", async () => {
    const payload = randomBytes(200_000);
    const log: string[] = [];
    const { storage, files } = fakeStorage(log);
    vi.stubGlobal("navigator", { storage });
    const ac = new AbortController();
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        status: 200,
        headers: { get: (h: string) => (h === "content-length" ? String(payload.length) : null) },
        body: {
          getReader: () => {
            let at = 0;
            return {
              read: () => {
                if (at >= 100_000) {
                  ac.abort();
                  return Promise.reject(new Error("aborted"));
                }
                return Promise.resolve({ done: false, value: payload.subarray(at, (at += 50_000)) });
              },
            };
          },
        },
      }),
    );

    const posted: { type: string; have?: number }[] = [];
    await download({ url: URL_, file: FILE, bytes: payload.length }, (m) => {
      posted.push(m);
      log.push(`post:${m.type}`);
    }, ac.signal);

    expect(posted.at(-1)).toMatchObject({ type: "paused", have: 100_000 });
    expect(log.indexOf(`close:${FILE}`)).toBeLessThan(log.indexOf("post:paused"));
    expect(files.get(FILE)!.visible.length).toBe(100_000);
    const state = JSON.parse(new TextDecoder().decode(files.get(stateName(FILE))!.visible)) as { have: number };
    expect(state.have).toBe(100_000);
    await expect(modelStatus(FILE)).resolves.toMatchObject({ kind: "partial", have: 100_000 });
  });

  it("leaves nothing ready when the bytes do not hash to the manifest value", async () => {
    const payload = randomBytes(80_000);
    const log: string[] = [];
    const { storage } = fakeStorage(log);
    vi.stubGlobal("navigator", { storage });
    vi.stubGlobal("fetch", () => Promise.resolve({ status: 200, headers: { get: (h: string) => (h === "content-length" ? String(payload.length) : null) }, body: body(payload, 8_192) }));

    const posted: { type: string; message?: string }[] = [];
    await download({ url: URL_, file: FILE, bytes: payload.length, sha256: "00".repeat(32) }, (m) => posted.push(m), new AbortController().signal);

    expect(posted.at(-1)?.type).toBe("error");
    expect(posted.at(-1)?.message).toMatch(/checksum mismatch/);
    await expect(modelStatus(FILE)).resolves.toMatchObject({ kind: "missing" });
  });
});

/** A models directory whose file only becomes readable at its full size after `afterReads` attempts. */
function latePublish(size: number, afterReads: number) {
  let reads = 0;
  const meta = JSON.stringify({ url: URL_, bytes: size, sha256: "ab", verified: true, at: "now" });
  const dir = {
    getFileHandle: (name: string) =>
      Promise.resolve({
        getFile: () => {
          if (name.endsWith(".json")) return Promise.resolve({ size: meta.length, text: () => Promise.resolve(meta) });
          return Promise.resolve({ size: reads++ < afterReads ? 0 : size, text: () => Promise.resolve("") });
        },
      }),
  };
  return { getDirectory: () => Promise.resolve({ getDirectoryHandle: () => Promise.resolve(dir) }), dir };
}

describe("publishing a just-closed OPFS file (QA F22)", () => {
  it("readyModelStatus re-reads instead of calling a verified download a failure", async () => {
    const storage = latePublish(300_000, 3);
    vi.stubGlobal("navigator", { storage });
    await expect(modelStatus(FILE)).resolves.toMatchObject({ kind: "missing" });
    await expect(readyModelStatus(FILE, 10, 1)).resolves.toMatchObject({ kind: "ready" });
  });
  it("readyModelStatus gives up rather than hanging when the file never appears", async () => {
    const storage = latePublish(300_000, 1000);
    vi.stubGlobal("navigator", { storage });
    await expect(readyModelStatus(FILE, 3, 1)).resolves.toMatchObject({ kind: "missing" });
  });
  it("the worker waits for the file to be visible at its full size before it writes the meta", async () => {
    const { dir } = latePublish(300_000, 2);
    await expect(awaitPublished(dir as unknown as FileSystemDirectoryHandle, FILE, 300_000, 10, 1)).resolves.toBe(true);
    const { dir: never } = latePublish(300_000, 1000);
    await expect(awaitPublished(never as unknown as FileSystemDirectoryHandle, FILE, 300_000, 3, 1)).resolves.toBe(false);
  });
});
