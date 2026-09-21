import type { ChipClass } from "./speed";
import type { CatalogModel, Tier } from "./types";

/** Device floor and default by RAM (spec §6.3). */
export type DeviceClass = "phone" | "tablet" | "desktop";

export interface DeviceProfile {
  ramGB: number;
  deviceClass: DeviceClass;
  /** Unlocks Pro tiers as defaults (desktop 8 GB defaults to Sharp only for Pro users). */
  pro?: boolean;
  /** Discrete GPU memory on desktops; 24 GB opens Studio. */
  gpuGB?: number;
  /** Speed class of the chip; without it the recommendation cannot tell a tier that is merely slow from one that is unusable here. */
  chip?: ChipClass;
}

export type RamFit = "well" | "slowly" | "no";

export const TIER_ORDER: readonly Tier[] = ["instant", "fast", "sharp", "power", "studio"];
const tierRank = (t: Tier | undefined): number => (t ? TIER_ORDER.indexOf(t) : -1);

export function ramFit(model: CatalogModel, ramGB: number): RamFit {
  if (ramGB >= model.recommendedRamGB) return "well";
  if (ramGB >= model.minRamGB) return "slowly";
  return "no";
}

/** The tier the §6.3 table names as the default for this device. */
export function defaultTier(device: DeviceProfile): Tier {
  if (device.deviceClass === "desktop") return device.ramGB >= 16 ? "power" : "sharp";
  return device.ramGB < 6 ? "instant" : "fast";
}

/** The largest tier §6.3 allows on this device ("Too big" starts above it). */
export function maxTier(device: DeviceProfile): Tier {
  if (device.deviceClass === "desktop") {
    if (device.ramGB >= 32 || (device.gpuGB ?? 0) >= 24) return "studio";
    return device.ramGB >= 16 ? "power" : "sharp";
  }
  if (device.ramGB >= 12) return "power";
  if (device.ramGB >= 6) return "sharp";
  return "instant";
}

const chatModels = (models: CatalogModel[]) => models.filter((m) => m.role === "chat" && m.tier);

/**
 * Recommended default for this device: the §6.3 tier when it fits and the user may run it, otherwise the
 * best free tier below it that still fits. Never a model above the RAM floor.
 */
export function pickDefault(models: CatalogModel[], device: DeviceProfile): CatalogModel | undefined {
  const candidates = chatModels(models).filter((m) => ramFit(m, device.ramGB) !== "no" && (device.pro || !m.proOnly));
  const wanted = tierRank(defaultTier(device));
  const ranked = candidates.filter((m) => tierRank(m.tier) <= wanted).sort((a, b) => tierRank(b.tier) - tierRank(a.tier));
  return ranked[0];
}

export interface TooBig {
  model: CatalogModel;
  reason: "ram" | "engine";
}

export interface ModelGroups {
  /** Tiers the device can run, in tier order. */
  fits: CatalogModel[];
  /** Greyed rows with the reason; a 4 GB phone sees every tier above Instant here. */
  tooBig: TooBig[];
}

export function groupByFit(models: CatalogModel[], device: DeviceProfile, engineVersion: number): ModelGroups {
  const fits: CatalogModel[] = [];
  const tooBig: TooBig[] = [];
  const ceiling = tierRank(maxTier(device));
  for (const m of chatModels(models).sort((a, b) => tierRank(a.tier) - tierRank(b.tier))) {
    if (m.minEngine > engineVersion) tooBig.push({ model: m, reason: "engine" });
    else if (ramFit(m, device.ramGB) === "no" || tierRank(m.tier) > ceiling) tooBig.push({ model: m, reason: "ram" });
    else fits.push(m);
  }
  return { fits, tooBig };
}
