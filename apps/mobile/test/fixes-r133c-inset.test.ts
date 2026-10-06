import { describe, expect, it, vi } from "vitest";
import { composerInset, scrollListToEnd } from "../src/lib/listEnd";

/**
 * Round 133C (Moshe, Build 37): with a file attached, the end of the last answer (SOURCES chips, LEDGER line) sat
 * under the composer's attached-file row until the file was removed.
 */
const fakeList = (nativeEnd = true) => {
  const native = { scrollToEnd: vi.fn() };
  return { native, list: { scrollToEnd: vi.fn(), scrollToOffset: vi.fn(), getNativeScrollRef: () => (nativeEnd ? native : {}) } };
};

describe("round 133C · the answer's end clears the composer", () => {
  it("the inset grows with the composer: attached-file row, Redact row, hold card", () => {
    const composer = composerInset(96, 0, 34);
    const withFile = composerInset(96 + 40, 0, 34);
    const withRedact = composerInset(96 + 40 + 36, 0, 34);
    expect(withFile - composer).toBe(40);
    expect(withRedact - withFile).toBe(36);
    expect(composerInset(96, 0, 34)).toBe(96 - 34 + 8);
  });

  it("with the keyboard up the whole bar covers the list", () => {
    expect(composerInset(136, 336, 34)).toBe(136 + 8);
  });

  it("no safe area and no keyboard: the bar's height plus the gap; a bar not measured yet leaves only the gap", () => {
    expect(composerInset(96, 0, 0)).toBe(104);
    expect(composerInset(0, 0, 34)).toBe(8);
  });

  it("iOS scrolls the native view to its real end, padding included, not the list's last cell", () => {
    const { list, native } = fakeList();
    scrollListToEnd(list, "ios", false);
    expect(native.scrollToEnd).toHaveBeenCalledWith({ animated: false });
    expect(list.scrollToEnd).not.toHaveBeenCalled();
  });

  it("Android keeps the clamped far offset; web and a ref without the method fall back to the list", () => {
    const a = fakeList();
    scrollListToEnd(a.list, "android", true);
    expect(a.list.scrollToOffset).toHaveBeenCalledWith({ offset: 1e6, animated: true });
    const w = fakeList();
    scrollListToEnd(w.list, "web", true);
    expect(w.list.scrollToEnd).toHaveBeenCalledWith({ animated: true });
    expect(w.native.scrollToEnd).not.toHaveBeenCalled();
    const bare = fakeList(false);
    scrollListToEnd(bare.list, "ios", false);
    expect(bare.list.scrollToEnd).toHaveBeenCalledWith({ animated: false });
    expect(() => scrollListToEnd(null, "ios", false)).not.toThrow();
  });
});
