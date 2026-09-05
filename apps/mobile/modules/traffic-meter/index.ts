import { requireOptionalNativeModule } from "expo";

export interface UidBytes {
  tx: number;
  rx: number;
}

interface NativeTrafficMeter {
  getUidBytes(): UidBytes | null;
}

/** Android only: bytes our uid sent/received since boot (TrafficStats). iOS has no per-app counter; web has no native part. */
const native = requireOptionalNativeModule<NativeTrafficMeter>("TrafficMeter");

export const hasTrafficCounter = (): boolean => native !== null;

export function getUidBytes(): UidBytes | null {
  return native?.getUidBytes() ?? null;
}
