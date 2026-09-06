import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";
import { spaceCheck } from "./opfs";

describe("formatBytes", () => {
  it("prints catalog-style decimal sizes", () => {
    expect(formatBytes(532_517_120)).toBe("533 MB");
    expect(formatBytes(2_740_000_000)).toBe("2.7 GB");
    expect(formatBytes(12_000_000_000)).toBe("12 GB");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(-1)).toBe("?");
  });
});

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
