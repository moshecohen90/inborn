/** Lucide paths (ISC, see LICENSE-lucide.txt), 24×24 viewBox, 2px round stroke. `mirror` flips the glyph in RTL layouts. */
export interface IconDef {
  paths: string[];
  rects?: { x: number; y: number; width: number; height: number; rx: number }[];
  mirror?: boolean;
}

export const ICONS = {
  plane: { paths: ["M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"] },
  incognito: { paths: ["M18 11c-1.5 0-2.5.5-3 2", "M4 6a2 2 0 0 0-2 2v4a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V8a2 2 0 0 0-2-2h-3a8 8 0 0 0-5 2 8 8 0 0 0-5-2z", "M6 11c1.5 0 2.5.5 3 2"] },
  mic: { paths: ["M12 19v3", "M19 10v2a7 7 0 0 1-14 0v-2"], rects: [{ x: 9, y: 2, width: 6, height: 13, rx: 3 }] },
  arrowUp: { paths: ["m5 12 7-7 7 7", "M12 19V5"] },
  stop: { paths: [], rects: [{ x: 3, y: 3, width: 18, height: 18, rx: 2 }] },
  paperclip: { paths: ["m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"] },
  plus: { paths: ["M5 12h14", "M12 5v14"] },
  chevronRight: { paths: ["m9 18 6-6-6-6"], mirror: true },
  chevronLeft: { paths: ["m15 18-6-6 6-6"], mirror: true },
  chevronDown: { paths: ["m6 9 6 6 6-6"] },
  x: { paths: ["M18 6 6 18", "m6 6 12 12"] },
  check: { paths: ["M20 6 9 17l-5-5"] },
  pin: { paths: ["M12 17v5", "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"] },
  upload: { paths: ["M12 3v12", "m17 8-5-5-5 5", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"] },
  camera: { paths: ["M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z", "M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"] },
  image: { paths: ["m21 15-5-5L5 21", "M11 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"], rects: [{ x: 3, y: 3, width: 18, height: 18, rx: 2 }] },
  volume: { paths: ["M11 5 6 9H2v6h4l5 4z", "M15.54 8.46a5 5 0 0 1 0 7.07", "M19.07 4.93a10 10 0 0 1 0 14.14"] },
  more: { paths: ["M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0z", "M20 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0z", "M6 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"] },
  waveform: { paths: ["M2 12h2", "M6 8v8", "M10 4v16", "M14 7v10", "M18 10v4", "M22 12h-2"] },
} as const satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;
