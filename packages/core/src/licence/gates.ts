import { tierAtLeast } from "./entitlement";
import type { LicenceTier } from "./types";

/**
 * Every gated capability (spec §7.5–§7.9). Never gated: privacy, security, proof, a good model, unlimited chat,
 * accessibility, languages, reporting (§12.3) — they do not appear here on purpose.
 */
export const FEATURES = {
  /* Pro (§7.9) */
  documents: "pro",
  ocr: "pro",
  unlimitedPersonas: "pro",
  memory: "pro",
  folders: "pro",
  exportAll: "pro",
  encryptedBackup: "pro",
  deviceTransfer: "pro",
  neuralVoices: "pro",
  voiceConversation: "pro",
  whisperDictation: "pro",
  keyboardExtension: "pro",
  customQuickActions: "pro",
  advancedShortcuts: "pro",
  personaWidgets: "pro",
  macosServices: "pro",
  lanConnection: "pro",
  advancedControls: "pro",
  gpuTuning: "pro",
  customContextLength: "pro",
  speculativeDecoding: "pro",
  multiModel: "pro",
  compareModels: "pro",
  localServer: "pro",
  calendarContacts: "pro",
  iconPacks: "pro",
  detailedStats: "pro",
  /** Catalog entries flagged `proOnly` (Sharp). */
  proModels: "pro",
  /* Work (§7.9) */
  professionPacks: "work",
  templates: "work",
  clientVaults: "work",
  redaction: "work",
  officeIngest: "work",
  recordsDictation: "work",
  auditLog: "work",
  signedExport: "work",
  largeModels: "work",
  teamLicence: "work",
  architectureStatement: "work",
} as const satisfies Record<string, Exclude<LicenceTier, "free">>;

export type Feature = keyof typeof FEATURES;
export const FEATURE_LIST = Object.keys(FEATURES) as Feature[];

export const requiredTier = (feature: Feature): Exclude<LicenceTier, "free"> => FEATURES[feature];

/** The one question every screen asks. */
export const can = (tier: LicenceTier, feature: Feature): boolean => tierAtLeast(tier, FEATURES[feature]);

/** Free limits that Pro lifts (§7.6, §7.8, §7.9). `Infinity` = unlimited. */
export interface Limits {
  personas: number;
  filesPerChat: number;
  quickActions: number;
  /** Photos per message (§7.1 "Free one image · Pro several"). */
  imagesPerMessage: number;
}

export function limits(tier: LicenceTier): Limits {
  return tier === "free" ? { personas: 3, filesPerChat: 1, quickActions: 6, imagesPerMessage: 1 } : { personas: Infinity, filesPerChat: Infinity, quickActions: Infinity, imagesPerMessage: Infinity };
}

/** The bullet list on each paywall card (S60), in spec order. Keys into @inborn/i18n `paywall.pro.*` / `paywall.work.*`. */
export const PAYWALL_BULLETS: Record<"pro" | "work", readonly string[]> = {
  pro: ["documents", "personas", "voice", "backup", "keyboard", "controls"],
  work: ["packs", "vaults", "redaction", "office", "audit", "models"],
};
