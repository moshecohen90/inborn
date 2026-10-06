interface EndList {
  scrollToEnd(params: { animated: boolean }): void;
  scrollToOffset(params: { offset: number; animated: boolean }): void;
  getNativeScrollRef(): unknown;
}

/** Scrolls a chat list to the real end of its content, bottom padding included. */
export function scrollListToEnd(list: EndList | null | undefined, os: string, animated: boolean): void {
  if (!list) return;
  /* Android clamps a far offset to the real end; larger offsets overflow the native int. */
  if (os === "android") return list.scrollToOffset({ offset: 1e6, animated });
  /* The list's own scrollToEnd stops at the last cell and skips the padding that clears the floating composer on iOS 26, so the attached-file row hid the answer's end (r133C); the native view's uses its real content size. */
  const native = os === "ios" ? (list.getNativeScrollRef() as { scrollToEnd?: (p: { animated: boolean }) => void } | null | undefined) : null;
  if (native && typeof native.scrollToEnd === "function") return native.scrollToEnd({ animated });
  list.scrollToEnd({ animated });
}

/** Bottom padding that clears a composer floating over the list; the list already stops above the safe area or the keyboard, so only the bar's part above that line is covered. */
export function composerInset(barHeight: number, lift: number, safeBottom: number, gap = 8): number {
  const listBottom = lift || safeBottom;
  return Math.max(0, barHeight - (listBottom - lift)) + gap;
}
