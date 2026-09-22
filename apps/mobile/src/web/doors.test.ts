import { afterEach, describe, expect, it } from "vitest";
import { webDoorsApply } from "./doors";

const w = globalThis as { window?: unknown };
const had = "window" in w;
const original = w.window;

afterEach(() => {
  if (had) w.window = original;
  else delete w.window;
});

describe("webDoorsApply", () => {
  it("gates the browser doors on a plain browser", () => {
    w.window = {};
    expect(webDoorsApply()).toBe(true);
  });

  it("lets the desktop shell through: F41, the Tauri window never sees the download door", () => {
    w.window = { __TAURI__: { core: {}, event: {} } };
    expect(webDoorsApply()).toBe(false);
  });

  it("treats a runtime without a window as a browser rather than as the shell", () => {
    delete w.window;
    expect(webDoorsApply()).toBe(true);
  });
});
