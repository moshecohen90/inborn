import { downloadPercent, formatModelBytes, type RepairOutcome } from "@inborn/core";
import type { DeviceState } from "../../device/types";
import type { DeliveryState } from "../../services/AppServices";

export interface BannerRow {
  key: string;
  tone: "amber" | "danger" | "muted";
  text: string;
  action?: { label: string; onPress: () => void };
  icon?: string;
}

export interface BannerInput {
  device: DeviceState;
  storageFull: boolean;
  repair: RepairOutcome | null;
  /** The guard paused an answer of the chat on screen (QA F28). */
  pausedHere: boolean;
  delivery: DeliveryState | null;
}

export interface BannerActions {
  dismissRepair(): void;
  manageStorage(): void;
  switchToInstant(): void;
  switchBack(): void;
  continueGeneration(): void;
  continuePaused(): void;
}

type T = (key: string, params?: Record<string, unknown>) => string;

/** §8.8 system-wide states as rows of the strip under the header; Banners.tsx only draws them. */
export function bannerRows({ device, storageFull, repair, pausedHere, delivery }: BannerInput, act: BannerActions, t: T): BannerRow[] {
  const rows: BannerRow[] = [];
  const rec = device.recommendation;
  /* The database was damaged. The app kept the old file and said so, because a silent recovery reads as "my chats are gone". */
  if (repair)
    rows.push({
      key: "repair",
      tone: "amber",
      icon: "▲",
      text: repair.kind === "started-fresh" ? t("state.dbStartedFresh") : t("state.dbRepaired", { count: repair.lost }),
      action: { label: t("safety.dismiss"), onPress: act.dismissRepair },
    });
  if (rec.kind === "storageFull" || storageFull) rows.push({ key: "storage", tone: "amber", icon: "▲", text: t("state.storageFull"), action: { label: t("state.manageStorage"), onPress: act.manageStorage } });
  if (device.thermal === "critical" || (rec.kind === "pause" && rec.reason === "thermal"))
    rows.push({ key: "thermal-critical", tone: "danger", text: t("state.thermalCritical"), action: { label: t("state.continue"), onPress: act.continueGeneration } });
  else if (device.thermal === "serious") {
    /* The policy offers a thermal switch only when a smaller model than the active one is installed (§6.5); under Instant there is none. */
    const smaller = rec.kind === "switchToInstant" && rec.reason === "thermal";
    rows.push({ key: "thermal", tone: "amber", text: t("state.thermalSerious"), ...(smaller ? { action: { label: t("state.switchToInstant"), onPress: act.switchToInstant } } : {}) });
  }
  if (rec.kind === "pause" && rec.reason === "memory") rows.push({ key: "memory", tone: "danger", text: t("state.memoryStopped"), action: { label: t("state.continue"), onPress: act.continueGeneration } });
  if (rec.kind === "paused" && pausedHere) rows.push({ key: "paused", tone: "muted", text: t("state.pausedInBackground"), action: { label: t("state.continue"), onPress: act.continuePaused } });
  if (rec.kind === "switchToInstant" && rec.auto && rec.reason === "fit") rows.push({ key: "memory", tone: "muted", text: t("state.fitSwitched"), action: { label: t("state.switchBack"), onPress: act.switchBack } });
  else if (rec.kind === "switchToInstant" && rec.auto && rec.reason === "memory") rows.push({ key: "memory", tone: "amber", text: t("state.memorySwitched"), action: { label: t("state.switchBack"), onPress: act.switchBack } });
  else if (rec.kind === "switchToInstant" && rec.auto) rows.push({ key: "lowpower", tone: "muted", text: t("state.lowPowerSwitched"), action: { label: t("state.switchBack"), onPress: act.switchBack } });
  else if (rec.kind === "switchToInstant" && rec.reason === "battery" && device.battery.level !== null)
    rows.push({ key: "battery", tone: "muted", text: t("state.batteryOffer", { pct: Math.round(device.battery.level * 100) }), action: { label: t("state.switch"), onPress: act.switchToInstant } });
  if (delivery && delivery.status === "delivering")
    /* Same bytes as the model card below it (F376): reconstructing them from the fraction AppServices already computed keeps this in exact lockstep instead of re-deriving its own rounding. */
    rows.push({ key: "delivery", tone: "muted", text: t("state.delivering", { name: delivery.name, pct: downloadPercent(delivery.progress * delivery.totalBytes, delivery.totalBytes), size: formatModelBytes(delivery.totalBytes) }) });
  else if (delivery && delivery.status === "verifying") rows.push({ key: "delivery", tone: "muted", text: t("state.verifying", { name: delivery.name, size: formatModelBytes(delivery.totalBytes) }) });
  return rows;
}
