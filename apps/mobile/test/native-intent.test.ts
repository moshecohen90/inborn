import { beforeEach, describe, expect, it, vi } from "vitest";

/* The hook's effect, run by hand: vitest here has no renderer. */
const effects: Array<() => void | (() => void)> = [];
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (fn: () => void | (() => void)) => {
    effects.push(fn);
  },
}));

const { redirectSystemPath } = await import("../src/app/+native-intent");
const { offerOpenedFile, resetOpenedFiles, useGgufOpenHandler } = await import("../src/vault/fileHandler");

function mountHandler(onOpen: (url: string) => void): () => void {
  useGgufOpenHandler(onOpen);
  const cleanup = effects.pop()!();
  return () => (typeof cleanup === "function" ? cleanup() : undefined);
}

beforeEach(resetOpenedFiles);

describe("redirectSystemPath · a model file opened with Inborn is not a route", () => {
  it("keeps the screen that takes it, opens the vault when no screen can, and lands on the first screen on a cold start", () => {
    const media = "content://media/external/downloads/1000050223";
    expect(redirectSystemPath({ path: media, initial: true })).toBe("/");
    resetOpenedFiles();
    expect(redirectSystemPath({ path: media, initial: false })).toBe("/vault");
    resetOpenedFiles();
    mountHandler(() => undefined);
    expect(redirectSystemPath({ path: "file:///storage/emulated/0/Download/Qwen3.5-0.8B-Q4_K_M.gguf", initial: false })).toBeNull();
  });

  it("leaves the app's own links alone", () => {
    expect(redirectSystemPath({ path: "inborn://vault", initial: false })).toBe("inborn://vault");
    expect(redirectSystemPath({ path: "/settings", initial: true })).toBe("/settings");
  });
});

describe("offerOpenedFile · the file reaches the screen that imports", () => {
  it("a file opened before the model step is up is held and delivered when it mounts, once", () => {
    const cold = "content://media/external/downloads/1000050224";
    expect(offerOpenedFile(cold)).toBe("held");
    const got: string[] = [];
    const unmount = mountHandler((u) => got.push(u));
    expect(got).toEqual([cold]);
    unmount();
    const again: string[] = [];
    mountHandler((u) => again.push(u));
    expect(again).toEqual([]);
  });

  it("a file opened while screens are up goes to the one mounted last only; a route is refused", () => {
    const first: string[] = [];
    const second: string[] = [];
    mountHandler((u) => first.push(u));
    const unmountSecond = mountHandler((u) => second.push(u));
    expect(offerOpenedFile("inborn://vault")).toBe(false);
    expect(offerOpenedFile("file:///tmp/a.gguf")).toBe("taken");
    expect(first).toEqual([]);
    expect(second).toEqual(["file:///tmp/a.gguf"]);
    unmountSecond();
    expect(offerOpenedFile("file:///tmp/b.gguf")).toBe("taken");
    expect(first).toEqual(["file:///tmp/b.gguf"]);
  });
});
