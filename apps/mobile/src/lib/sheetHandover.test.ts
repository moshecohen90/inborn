import { afterEach, describe, expect, it, vi } from "vitest";

/* The module reads Platform.OS once per import, so each case imports it fresh under its own platform. */
async function handover(os: string) {
  vi.resetModules();
  vi.doMock("react-native", () => ({ Platform: { OS: os } }));
  return (await import("./sheetHandover")).afterSheetClose;
}

afterEach(() => {
  vi.doUnmock("react-native");
  vi.useRealTimers();
});

/**
 * F101: the hand-over exists only because Android freezes when a Modal opens in the frame another one dismisses.
 * A browser has no such collision, so waiting there is 320 ms of nothing between the tap and the result.
 */
describe("afterSheetClose", () => {
  it("runs inside the gesture on web, where there is no dismissing Modal to wait for", async () => {
    const after = await handover("web");
    const ran: number[] = [];
    after(() => ran.push(1));
    expect(ran, "web must not defer: nothing there needs the delay").toEqual([1]);
  });

  it("still waits out the sheet animation on the phones, where a Modal opening into a dismissing one freezes", async () => {
    vi.useFakeTimers();
    for (const os of ["android", "ios"]) {
      const after = await handover(os);
      const ran: number[] = [];
      after(() => ran.push(1));
      expect(ran, `${os} must not run in the dismissing frame`).toEqual([]);
      vi.advanceTimersByTime(319);
      expect(ran, `${os} must not run early`).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(ran, `${os} must run once the sheet is gone`).toEqual([1]);
    }
  });

  it("hands the action over exactly once, on every platform", async () => {
    vi.useFakeTimers();
    for (const os of ["web", "android", "ios"]) {
      const after = await handover(os);
      const fn = vi.fn();
      after(fn);
      vi.advanceTimersByTime(5_000);
      expect(fn, os).toHaveBeenCalledTimes(1);
    }
  });
});
