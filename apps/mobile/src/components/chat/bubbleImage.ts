/** The largest box a sent photo takes in its bubble; it fits a 390 px phone's bubble with room to spare. */
export const THUMB_MAX = { width: 240, height: 180 } as const;

/** The photo's own shape, scaled into THUMB_MAX and never above its own pixels, so nothing of it is cut off. */
export function fitThumb(width: number, height: number, max: { width: number; height: number } = THUMB_MAX): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: max.width, height: max.height };
  const scale = Math.min(max.width / width, max.height / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
