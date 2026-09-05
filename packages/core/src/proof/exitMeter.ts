/** Exit meter (spec §5.1, §9.5): bytes the app sent/received since install, from a boot-relative counter. */
export interface MeterSample {
  /** Bytes sent by our uid since boot (Android TrafficStats.getUidTxBytes). */
  tx: number;
  /** Bytes received by our uid since boot. */
  rx: number;
}

export interface MeterState {
  outBytes: number;
  inBytes: number;
  lastTx: number;
  lastRx: number;
  /** Epoch ms of the first sample (install). */
  since: number;
}

export const emptyMeter = (now: number): MeterState => ({ outBytes: 0, inBytes: 0, lastTx: 0, lastRx: 0, since: now });

/** Folds a boot-relative sample into the lifetime totals; a counter smaller than the last one means the device rebooted. */
export function accumulate(state: MeterState, sample: MeterSample): MeterState {
  const tx = Math.max(0, sample.tx);
  const rx = Math.max(0, sample.rx);
  const dTx = tx >= state.lastTx ? tx - state.lastTx : tx;
  const dRx = rx >= state.lastRx ? rx - state.lastRx : rx;
  if (dTx === 0 && dRx === 0 && tx === state.lastTx && rx === state.lastRx) return state;
  return { ...state, outBytes: state.outBytes + dTx, inBytes: state.inBytes + dRx, lastTx: tx, lastRx: rx };
}

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** "0 B", "2 KB", "12.4 MB", "2.71 GB": three significant digits at most, no trailing zeros. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  let v = n;
  let i = 0;
  while (v >= 1000 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  const s = i === 0 ? String(Math.round(v)) : v.toFixed(digits).replace(/\.?0+$/, "");
  return `${s} ${UNITS[i]}`;
}

export const daysSince = (since: number, now: number): number => Math.max(0, Math.floor((now - since) / 86_400_000));
