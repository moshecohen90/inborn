import type { Tier } from "@inborn/core";

/** What the browser is willing to tell us; every field may be missing, and the gate must stay honest about that. */
export interface DeviceSignals {
  userAgent: string;
  /** navigator.deviceMemory: Chromium only, rounded to a power of two and capped at 8. */
  deviceMemoryGB?: number;
  /** navigator.userAgentData.mobile (UA client hints), Chromium only. */
  uaMobile?: boolean;
  maxTouchPoints?: number;
  hardwareConcurrency?: number;
  webgpu: boolean;
}

export type FormFactor = "phone" | "tablet" | "desktop" | "unknown";

export interface DeviceGate {
  formFactor: FormFactor;
  /** Largest tier the web tier will offer here (spec §14.3: desktop up to Sharp, phone up to Instant). */
  maxTier: Tier;
  ramGB: number | null;
  /** navigator.hardwareConcurrency: the only capability signal left when a browser hides its memory (Safari, Firefox). */
  cores: number | null;
  /** iPhone Safari caps a tab well under 500 MB: the door says "install the app" (spec §4.4, §8.9). */
  iphone: boolean;
  webgpu: boolean;
}

const TIER_ORDER: Tier[] = ["instant", "fast", "sharp", "power"];
export const tierIndex = (t: Tier): number => TIER_ORDER.indexOf(t);
export const tierFits = (t: Tier, max: Tier): boolean => tierIndex(t) <= tierIndex(max);

export function formFactorOf(s: DeviceSignals): FormFactor {
  const ua = s.userAgent;
  if (/iPhone|iPod/.test(ua)) return "phone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && (s.maxTouchPoints ?? 0) > 1)) return "tablet";
  if (s.uaMobile === true) return "phone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "phone" : "tablet";
  if (s.uaMobile === false || /Windows NT|Macintosh|X11|Linux|CrOS/.test(ua)) return "desktop";
  return "unknown";
}

/**
 * The device gate (spec §14.3, §8.9). Without a readable memory figure the answer is deliberately conservative:
 * Sharp (2.7 GB in a 32-bit WASM heap) is offered only when the browser reports 8 GB or more.
 */
export function classifyDevice(s: DeviceSignals): DeviceGate {
  const formFactor = formFactorOf(s);
  const ramGB = typeof s.deviceMemoryGB === "number" && s.deviceMemoryGB > 0 ? s.deviceMemoryGB : null;
  let maxTier: Tier;
  if (formFactor === "phone") maxTier = "instant";
  else if (formFactor === "tablet") maxTier = ramGB !== null && ramGB >= 8 ? "sharp" : "fast";
  else if (ramGB === null) maxTier = "fast";
  else if (ramGB >= 8) maxTier = "sharp";
  else if (ramGB >= 4) maxTier = "fast";
  else maxTier = "instant";
  const cores = typeof s.hardwareConcurrency === "number" && s.hardwareConcurrency > 0 ? s.hardwareConcurrency : null;
  return { formFactor, maxTier, ramGB, cores, iphone: /iPhone|iPod/.test(s.userAgent), webgpu: s.webgpu };
}

type HintedNavigator = Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean }; gpu?: unknown };

/** Reads the signals off the live navigator; `webgpu` only says the API exists (an adapter is asked for at load). */
export function readDeviceSignals(nav: Navigator = navigator): DeviceSignals {
  const n = nav as HintedNavigator;
  return {
    userAgent: n.userAgent ?? "",
    deviceMemoryGB: typeof n.deviceMemory === "number" ? n.deviceMemory : undefined,
    uaMobile: typeof n.userAgentData?.mobile === "boolean" ? n.userAgentData.mobile : undefined,
    maxTouchPoints: n.maxTouchPoints,
    hardwareConcurrency: n.hardwareConcurrency,
    webgpu: !!n.gpu,
  };
}
