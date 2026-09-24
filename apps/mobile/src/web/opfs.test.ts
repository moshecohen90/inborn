import { describe, expect, it } from "vitest";
import { spaceCheck } from "./opfs";

describe("spaceCheck", () => {
  it("needs the missing bytes plus headroom", () => {
    expect(spaceCheck({ usage: 100, quota: 1_000 }, 500, 0, 200)).toEqual({ ok: true, free: 900 });
    expect(spaceCheck({ usage: 100, quota: 1_000 }, 800, 0, 200)).toEqual({ ok: false, free: 900, needed: 1_000 });
    expect(spaceCheck({ usage: 100, quota: 1_000 }, 800, 300, 200)).toEqual({ ok: true, free: 900 });
  });
  it("passes when the browser gives no quota", () => {
    expect(spaceCheck({ usage: null, quota: null }, 5e9)).toEqual({ ok: true, free: null });
  });
});
