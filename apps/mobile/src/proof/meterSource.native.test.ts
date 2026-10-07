import { describe, expect, it, vi } from "vitest";

/* F462 (Android vc24): with system_server gone the counter read threw out of the meter tick as a fatal JavascriptException. */
let read: () => { tx: number; rx: number } | null = () => ({ tx: 1, rx: 2 });
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("../../modules/traffic-meter", () => ({ hasTrafficCounter: () => true, getUidBytes: () => read() }));

const { sample } = await import("./meterSource.native");

describe("F462 · a failed counter read never throws", () => {
  it("reads the counter, then answers no sample (the tick keeps its last total) and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(sample()).toEqual({ tx: 1, rx: 2 });
    read = () => {
      throw new Error("DeadSystemException");
    };
    expect(sample()).toBeNull();
    expect(sample()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    read = () => ({ tx: 3, rx: 4 });
    expect(sample()).toEqual({ tx: 3, rx: 4 });
    warn.mockRestore();
  });
});
