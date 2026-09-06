import { describe, expect, it } from "vitest";
import { SpeedWatch } from "../src/device";

describe("SpeedWatch (Windows throttling stand-in)", () => {
  it("flags a 35 % drop within 60 s and clears when speed is back within 20 % of the peak", () => {
    const w = new SpeedWatch();
    expect(w.sample(40, 0)).toBe(false);
    expect(w.sample(30, 10_000)).toBe(false);
    expect(w.sample(25, 20_000)).toBe(true);
    expect(w.sample(28, 30_000)).toBe(true);
    expect(w.sample(33, 40_000)).toBe(false);
  });

  it("forgets samples older than the window and needs two samples", () => {
    const w = new SpeedWatch();
    w.sample(40, 0);
    expect(w.sample(20, 61_000)).toBe(false);
    expect(w.isThrottling(61_000)).toBe(false);
  });

  it("ignores zero-speed samples", () => {
    const w = new SpeedWatch();
    w.sample(40, 0);
    expect(w.sample(0, 1000)).toBe(false);
  });
});
