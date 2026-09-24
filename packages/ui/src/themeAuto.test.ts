import { describe, expect, it } from "vitest";
import { isAutoDark } from "./themeAuto";

const at = (h: number, m = 0) => new Date(2026, 8, 24, h, m, 0);

describe("isAutoDark (F309 clock rule)", () => {
  it("is light at midday when the OS is light", () => {
    expect(isAutoDark(at(12), false)).toBe(false);
  });
  it("is dark at midday when the OS is dark, regardless of the clock", () => {
    expect(isAutoDark(at(12), true)).toBe(true);
  });
  it("stays light right up to the evening boundary", () => {
    expect(isAutoDark(at(17, 59), false)).toBe(false);
  });
  it("turns dark exactly at 18:00", () => {
    expect(isAutoDark(at(18, 0), false)).toBe(true);
  });
  it("stays dark through the night", () => {
    expect(isAutoDark(at(23, 30), false)).toBe(true);
    expect(isAutoDark(at(0, 0), false)).toBe(true);
    expect(isAutoDark(at(5, 59), false)).toBe(true);
  });
  it("turns light exactly at the 06:00 morning boundary", () => {
    expect(isAutoDark(at(6, 0), false)).toBe(false);
  });
  it("is dark before 06:00 even when the OS is light, and light at 06:00 even after a dark night", () => {
    expect(isAutoDark(at(5, 0), false)).toBe(true);
    expect(isAutoDark(at(6, 0), true)).toBe(true); // OS dark still wins after the clock flips to day
  });
});
