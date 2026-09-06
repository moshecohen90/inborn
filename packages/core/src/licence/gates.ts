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

/**
 * The value lines on each S60 card, in spec order. Only capabilities that ship in this build may appear (§2.3 "proof, not
 * promise"; §12.3): a line here must be backed by a gate above and by code on main. Keys into @inborn/i18n `paywall.pro.*`.
 * Work lines are backed by packages/core/src/work (client vaults, audit log + signed export, profession packs, the
 * architecture statement); redaction and office intake join when the work-docs stream lands.
 */
export const PAYWALL_BULLETS: Record<"pro" | "work", readonly string[]> = {
  pro: ["documents", "personas", "folders", "models", "voice"],
  work: ["vaults", "audit", "signed", "packs", "statement"],
};

/** Lines that exist only if the voice stream (M5b) lands in the same release; remove them together if it slips. */
export const VOICE_LINES: readonly string[] = ["voice"];

/** A tier is offered on the paywall only when it has at least one shipped capability to show for the price. */
export const sellable = (tier: "pro" | "work"): boolean => PAYWALL_BULLETS[tier].length > 0;
