/** FARADAY design tokens (spec §9). The accent is never a button fill; sealed/danger are semantic only. */
export const dark = {
  bg: "#0A0D11",
  surface1: "#12161B",
  surface2: "#181D23",
  well: "#0E1115",
  border: "#1F262E",
  text: "#EEF2F5",
  text2: "#9AA6B2",
  text3: "#7A8794",
  accent: "#F0B35B",
  sealed: "#3ECF8E",
  danger: "#F25555",
  ctaFill: "#E6EAEE",
  ctaText: "#0A0D11",
  /** Text on a danger fill (the one filled colour besides cta): light in both schemes. */
  onDanger: "#F3F5F7",
} as const;

export const light = {
  bg: "#F3F5F7",
  surface1: "#FFFFFF",
  surface2: "#FFFFFF",
  well: "#E9EDF1",
  border: "#DDE3E9",
  text: "#12161B",
  text2: "#4A5560",
  text3: "#5E6975",
  accent: "#8F5309",
  sealed: "#0B7A4C",
  danger: "#C93A3A",
  ctaFill: "#12161B",
  ctaText: "#F3F5F7",
  onDanger: "#F3F5F7",
} as const;

export type Theme = { [K in keyof typeof dark]: string };

/** WCAG 2.x contrast ratio between two hex colours (checklist: text3 ≥ 4.5:1 on every surface). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string): number => {
    const c = (i: number) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
export type ThemeMode = "system" | "dark" | "light";
/** Default is the device setting (decision D7). */
export const DEFAULT_THEME_MODE: ThemeMode = "system";

/** Glow/bloom fills keep the dark accent in both schemes (§9.2): only accent *text* darkens in light mode. */
export const glow = { filament: "#F0B35B", sealed: "#3ECF8E" } as const;

/** IBM Plex (OFL 1.1) ships in the bundle: `apps/mobile/assets/fonts` on native (expo-font), `public/fonts` on web (@font-face). */
export const fontFamilies = { sans: "IBMPlexSans", mono: "IBMPlexMono" } as const;
export type FontKind = keyof typeof fontFamilies;
export type FontWeight = "400" | "500" | "600";

/** Web stacks: the bundled family first, then each platform's own sans/mono, so no surface can ever land on a serif. */
export const fonts = {
  sans: '"IBMPlexSans", -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"IBMPlexMono", ui-monospace, Menlo, Consolas, monospace',
} as const;

/** One registered family name per bundled face: Android cannot pick a weight inside a custom family, it would synthesise bold. */
export const fontFaces: Record<FontKind, Record<FontWeight, string>> = {
  sans: { "400": "IBMPlexSans", "500": "IBMPlexSans-Medium", "600": "IBMPlexSans-SemiBold" },
  mono: { "400": "IBMPlexMono", "500": "IBMPlexMono-Medium", "600": "IBMPlexMono-Medium" },
};

export type FontWeightInput = FontWeight | "700" | "800" | "900" | "bold" | "normal" | 400 | 500 | 600 | 700;

/** Clamp any requested weight to a bundled face (Plex Bold is not shipped; SemiBold is the heaviest the scale uses). */
export function bundledWeight(weight: FontWeightInput = "400"): FontWeight {
  const n = weight === "bold" ? 700 : weight === "normal" ? 400 : Number(weight);
  return n >= 600 ? "600" : n >= 500 ? "500" : "400";
}

/** The `fontFamily` + `fontWeight` pair for a face: a CSS stack on the web, the exact registered face name on native. */
export function fontFace(kind: FontKind, weight: FontWeightInput = "400", platform: "web" | "native"): { fontFamily: string; fontWeight: FontWeight } {
  const w = bundledWeight(weight);
  return { fontFamily: platform === "web" ? fonts[kind] : fontFaces[kind][w], fontWeight: w };
}

/** §9.4: 4 chips/status dots · 10 buttons/fields · 14 cards · 20 sheets/cartridges · pill. `chip` stays the legacy pill alias. */
export const radius = { tag: 4, control: 10, card: 14, sheet: 20, pill: 999, chip: 999 } as const;

/** From this combined text scale the chat header drops its seal caption (the ring still says it) so the model name never truncates. */
export const COMPACT_CHROME_SCALE = 1.5;
export const compactChrome = (scale: number): boolean => scale >= COMPACT_CHROME_SCALE;

/** "#RRGGBB" with an alpha in [0, 1] → "#RRGGBBAA"; anything else passes through untouched. */
export function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${color}${a.toString(16).padStart(2, "0").toUpperCase()}`;
}
export const space = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

export interface TypeStep {
  font: FontKind;
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeight;
  /** Absolute units at scale 1 (the spec gives em); scaled with the size. */
  letterSpacing?: number;
  uppercase?: boolean;
}

/** §9.3 type scale. Mono only for readouts and labels, never paragraphs. */
export const typeScale = {
  display: { font: "sans", fontSize: 32, lineHeight: 38, fontWeight: "600", letterSpacing: -0.64 },
  title: { font: "sans", fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.22 },
  heading: { font: "sans", fontSize: 17, lineHeight: 24, fontWeight: "600" },
  body: { font: "sans", fontSize: 16, lineHeight: 25, fontWeight: "400" },
  bodySmall: { font: "sans", fontSize: 14, lineHeight: 20, fontWeight: "400" },
  caption: { font: "sans", fontSize: 12, lineHeight: 16, fontWeight: "500" },
  monoReadout: { font: "mono", fontSize: 12, lineHeight: 16, fontWeight: "400" },
  monoLabel: { font: "mono", fontSize: 11, lineHeight: 14, fontWeight: "500", letterSpacing: 0.88, uppercase: true },
} as const satisfies Record<string, TypeStep>;
export type TypeName = keyof typeof typeScale;

/** A step of the scale multiplied by the text-size setting; tracking scales with the glyphs so labels keep their shape. */
export function scaledStep(step: TypeStep, scale: number): TypeStep {
  return {
    ...step,
    fontSize: Math.round(step.fontSize * scale),
    lineHeight: Math.round(step.lineHeight * scale),
    ...(step.letterSpacing !== undefined ? { letterSpacing: Math.round(step.letterSpacing * scale * 100) / 100 } : {}),
  };
}

/** §9.4 motion, ms. Bounce only on the first seal close. */
export const motion = { press: 120, state: 180, sheet: 280, seal: 420, bloom: 600, breathe: 1600 } as const;
export const easing = { out: [0.23, 1, 0.32, 1] as const };

/** Text-size steps offered in Settings (multiplier on the whole type scale, every surface, web included); 200 % is the ceiling. */
export const TEXT_SCALES = [0.9, 1, 1.15, 1.3, 1.5, 1.75, 2] as const;
export const MAX_TEXT_SCALE = 2;
