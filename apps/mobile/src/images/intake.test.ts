import { afterEach, describe, expect, it, vi } from "vitest";
import { composerCanSend, pickIntoComposer } from "./intake";
import type { PickedImage, PickOutcome } from "./pick";

const photo: PickedImage = { uri: "file:///doc/images/a.jpg", width: 1024, height: 768, bytes: 90_000 };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** The composer as Chat.tsx holds it: a count of photos being prepared and the photos already in. */
function composer() {
  const s = { preparing: 0, images: [] as PickedImage[], log: [] as string[] };
  const io = {
    hold: (d: number) => {
      s.preparing += d;
      s.log.push(`hold ${d}`);
    },
    add: (images: PickedImage[]) => {
      s.images.push(...images);
      s.log.push(`add ${images.length}`);
    },
  };
  return { s, io, canSend: (text: string) => composerCanSend({ text, preparing: s.preparing, busy: false }) };
}

describe("F350 · a turn never leaves while a photo is being prepared", () => {
  it("the send is held from the moment the picker hands the photo over until it is in the composer", async () => {
    const { s, io, canSend } = composer();
    const scaled = deferred<PickOutcome>();
    const done = pickIntoComposer((onPicked) => {
      onPicked(1);
      return scaled.promise;
    }, io);
    await Promise.resolve();
    expect(s.preparing).toBe(1);
    expect(s.images).toEqual([]);
    expect(canSend("What do you see?")).toBe(false);
    scaled.resolve({ ok: true, images: [photo] });
    await done;
    expect(s.preparing).toBe(0);
    expect(s.images).toEqual([photo]);
    expect(canSend("What do you see?")).toBe(true);
    expect(s.log).toEqual(["hold 1", "add 1", "hold -1"]);
  });

  it("a photo that could not be prepared lets go of the send", async () => {
    const { s, io, canSend } = composer();
    await pickIntoComposer(async (onPicked) => {
      onPicked(2);
      return { ok: false, reason: "failed" };
    }, io);
    expect(s.preparing).toBe(0);
    expect(canSend("hi")).toBe(true);
  });

  it("a thrown preparation also lets go", async () => {
    const { s, io } = composer();
    await expect(
      pickIntoComposer(async (onPicked) => {
        onPicked(1);
        throw new Error("boom");
      }, io),
    ).rejects.toThrow("boom");
    expect(s.preparing).toBe(0);
  });

  it("a cancelled picker never holds anything", async () => {
    const { s, io } = composer();
    await pickIntoComposer(async () => ({ ok: false, reason: "cancelled" }), io);
    expect(s.log).toEqual([]);
  });

  it("busy, disabled and an empty draft still hold the send as before", () => {
    expect(composerCanSend({ text: "", preparing: 0, busy: false })).toBe(false);
    expect(composerCanSend({ text: "hi", preparing: 0, busy: true })).toBe(false);
    expect(composerCanSend({ text: "hi", preparing: 0, busy: false, disabled: true })).toBe(false);
  });
});

describe("F350 · the native picker reports the photos before it scales them", () => {
  afterEach(() => {
    for (const m of ["expo-file-system", "expo-image-manipulator", "expo-image-picker"]) vi.doUnmock(m);
    vi.resetModules();
  });

  it("onPicked fires while the downscale is still running", async () => {
    vi.resetModules();
    const render = deferred<unknown>();
    class FakeFile {
      size = 1;
      uri = "file:///doc/images/x.jpg";
      exists = true;
      move() {}
    }
    vi.doMock("expo-file-system", () => ({ File: FakeFile, Directory: class { exists = true; create() {} }, Paths: { document: { uri: "file:///doc/" } } }));
    vi.doMock("expo-image-manipulator", () => ({
      SaveFormat: { JPEG: "jpeg" },
      ImageManipulator: { manipulate: () => ({ resize() {}, renderAsync: () => render.promise }) },
    }));
    vi.doMock("expo-image-picker", () => ({ launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: "ph://door", width: 4032, height: 3024 }] }) }));
    const { pickImages } = await import("./pick.native");
    const picked: number[] = [];
    const done = pickImages("library", 4, (n) => picked.push(n));
    await new Promise((r) => setTimeout(r, 0));
    expect(picked).toEqual([1]);
    render.resolve({ saveAsync: async () => ({ uri: "file:///tmp/x.jpg", width: 1024, height: 768 }), release() {} });
    const r = await done;
    expect(r.ok).toBe(true);
  });
});
