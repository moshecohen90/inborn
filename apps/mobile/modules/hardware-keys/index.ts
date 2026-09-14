import { requireOptionalNativeModule } from "expo";

interface NativeHardwareKeys {
  setEnabled(on: boolean): void;
  addListener(event: "onEnter", listener: (e: { deviceId: number }) => void): { remove(): void };
}

/** Android only for now: a physical keyboard's Enter sends while the composer has focus (QA T28). Null elsewhere. */
const native = requireOptionalNativeModule<NativeHardwareKeys>("HardwareKeys");

export const hasHardwareEnter = (): boolean => native !== null;

/** Turns the Enter capture on while a composer is focused; returns the off switch. Shift+Enter is never captured. */
export function captureHardwareEnter(onEnter: () => void): () => void {
  if (!native) return () => undefined;
  native.setEnabled(true);
  const sub = native.addListener("onEnter", onEnter);
  return () => {
    sub.remove();
    native.setEnabled(false);
  };
}
