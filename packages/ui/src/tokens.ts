/** FARADAY design tokens (spec §9). The accent is never a button fill; sealed/danger are semantic only. */
export const dark = {
  bg: "#0A0D11",
  surface1: "#12161B",
  surface2: "#181D23",
  well: "#0E1115",
  border: "#1F262E",
  text: "#EEF2F5",
  text2: "#9AA6B2",
  text3: "#667380",
  accent: "#F0B35B",
  sealed: "#3ECF8E",
  danger: "#F25555",
  ctaFill: "#E6EAEE",
  ctaText: "#0A0D11",
} as const;

export const light = {
  bg: "#F3F5F7",
  surface1: "#FFFFFF",
  surface2: "#FFFFFF",
  well: "#E9EDF1",
  border: "#DDE3E9",
  text: "#12161B",
  text2: "#4A5560",
  text3: "#6B7682",
  accent: "#8F5309",
  sealed: "#0B7A4C",
  danger: "#C93A3A",
  ctaFill: "#12161B",
  ctaText: "#F3F5F7",
} as const;

export type Theme = { [K in keyof typeof dark]: string };
export type ThemeMode = "system" | "dark" | "light";
/** Default is the device setting (decision D7). */
export const DEFAULT_THEME_MODE: ThemeMode = "system";

/** Glow/bloom fills keep the dark accent in both schemes (§9.2): only accent *text* darkens in light mode. */
export const glow = { filament: "#F0B35B", sealed: "#3ECF8E" } as const;

export const fonts = {
  sans: "IBM Plex Sans",
  sansHebrew: "IBM Plex Sans Hebrew",
  mono: "IBM Plex Mono",
} as const;

/** Browsers accept a stack; native font names must be exact, so the web gets its own until Plex ships in the bundle. */
export const webFonts = {
  sans: "IBM Plex Sans, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  sansHebrew: "IBM Plex Sans Hebrew, system-ui, sans-serif",
  mono: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

/** §9.4: 4 chips/status dots · 10 buttons/fields · 14 cards · 20 sheets/cartridges · pill. `chip` stays the legacy pill alias. */
export const radius = { tag: 4, control: 10, card: 14, sheet: 20, pill: 999, chip: 999 } as const;
export const space = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

/** §9.3 type scale: [fontSize, lineHeight, weight, letterSpacing(em)]. Mono only for readouts and labels. */
export const typeScale = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "600", letterSpacing: -0.64 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.22 },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 25, fontWeight: "400" },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  monoReadout: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  monoLabel: { fontSize: 11, lineHeight: 14, fontWeight: "500", letterSpacing: 0.88 },
} as const;

/** §9.4 motion, ms. Bounce only on the first seal close. */
export const motion = { press: 120, state: 180, sheet: 280, seal: 420, bloom: 600, breathe: 1600 } as const;
export const easing = { out: [0.23, 1, 0.32, 1] as const };

/** Text-size steps offered in Settings (multiplier on the type scale). */
export const TEXT_SCALES = [0.9, 1, 1.15, 1.3] as const;
