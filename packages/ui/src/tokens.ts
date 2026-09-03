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

export const fonts = {
  sans: "IBM Plex Sans",
  sansHebrew: "IBM Plex Sans Hebrew",
  mono: "IBM Plex Mono",
} as const;

export const radius = { card: 14, control: 10, chip: 999 } as const;
export const space = [0, 4, 8, 12, 16, 20, 24, 32, 40] as const;
