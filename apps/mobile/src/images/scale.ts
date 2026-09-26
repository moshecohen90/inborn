/** The long edge a photo is scaled to before it is stored or sent: the phones cap at the same 1024 px. */
export const MAX_EDGE = 1024;

/** Scaled size keeping the aspect ratio; never enlarged. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max || long === 0) return { width, height };
  const k = max / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
