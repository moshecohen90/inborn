import type { Tier } from "../catalog/types";

/** Device protection policy (spec §6.5, §5.8, §10.2–10.3): inputs are raw device signals, output is one status line + one action. */

/** Which column of the §6.5 table applies. A laptop on AC behaves as "desktop" (no battery logic, heat only). */
export type GuardDeviceClass = "phone" | "tablet" | "laptop" | "desktop" | "browser";

/** iOS thermalState names; Android maps NONE→nominal, LIGHT/MODERATE→fair, SEVERE→serious, CRITICAL+→critical. */
export type ThermalState = "unknown" | "nominal" | "fair" | "serious" | "critical";
export type MemoryPressure = "unknown" | "normal" | "warning" | "critical";
export type PowerSource = "unknown" | "battery" | "ac";
export type BatteryState = "unknown" | "unplugged" | "charging" | "full";
export type ModelTier = Tier | "apple";
export type PowerProfile = "eco" | "balanced" | "max";

export interface BatterySignal {
  /** 0..1, null when the platform does not report it (most browsers). */
  level: number | null;
  state: BatteryState;
  /** iOS Low Power Mode / Android Battery Saver; null when unknown. */
  lowPowerMode: boolean | null;
}

export interface DeviceSignals {
  battery: BatterySignal;
  thermal: ThermalState;
  memoryPressure: MemoryPressure;
  powerSource: PowerSource;
  deviceClass: GuardDeviceClass;
  ramGB: number | null;
  currentTier: ModelTier;
  /** True while an answer is streaming: model switches wait for the next message (§6.5). */
  generating: boolean;
  /** Milliseconds since the app went to the background, null while in the foreground. */
  backgroundedForMs: number | null;
  /** The engine already cut an answer at the background grace (Android pauses JS timers, so the check rides on the token stream). */
  pausedInBackground?: boolean;
  /** Windows has no thermal API: a 35 % speed drop within 60 s (SpeedWatch) stands in for it. */
  throttling: boolean;
  /** Thread count the engine would use with nothing throttled. */
  baseThreads: number;
  /** Chat tiers with an installed model; when given, a switch is only proposed or applied towards one of them. */
  availableTiers?: ModelTier[];
}

/** S52 › Performance. Only the critical-heat protection ignores these. */
export interface UserOverride {
  autoPowerManagement: boolean;
  neverSwitchModel: boolean;
  profile: PowerProfile;
}

export type Status =
  | "normal"
  | "batteryLow"
  | "lowPower"
  | "batteryCritical"
  | "charging"
  | "recovered"
  | "thermalSerious"
  | "thermalCritical"
  | "throttling"
  | "memory"
  | "memoryBack"
  | "paused";

export type Action = "none" | "suggestSmallerModel" | "switchToSmaller" | "switchBack" | "pauseGeneration" | "unloadModel" | "throttleThreads";
export type Grade = "none" | "propose" | "act";
export type Button = "switch" | "switchTo" | "switchBack" | "switchBackTo" | "keep" | "continue" | "continueWhenCool" | "answerAnyway" | "switchSmaller";

export interface Recommendation {
  status: Status;
  /** i18n key of the single status line under the seal, null when nothing is shown. */
  headline: string | null;
  headlineParams: Record<string, string | number>;
  recommendation: Grade;
  action: Action;
  /** The one button on the status line (§6.5: every automatic change carries an undo). */
  button: Button | null;
  buttonParams: Record<string, string | number>;
  /** Tier a switch (proposed or applied) goes to; null when there is nothing smaller to switch to. */
  targetTier: ModelTier | null;
  threads: number;
  /** Load-time GPU offload; null keeps the engine default (all layers). */
  gpuLayers: number | null;
  /** Answer cap in tokens: 1,024 normally, 512 in saving modes (§6.5, §10). */
  maxTokens: number;
  /** KV context to load with: 2K under 6 GB (§6.3), else 4K. */
  contextCap: number;
  pauseDownloads: boolean;
  pauseIndexing: boolean;
  sealGlow: boolean;
  /** Below 5 %: ask before a long answer. */
  confirmLongAnswer: boolean;
  /** The current answer must stop now (critical heat, memory pressure, background grace expired). */
  stopGeneration: boolean;
  /** Unload the weights after this delay (0 = now); null keeps them resident. */
  unloadAfterMs: number | null;
  /** First automatic switch of the run: show the explainer sheet once (§6.5). */
  explain: boolean;
}

export interface PolicyOptions {
  /** How long an improved signal must hold before the status line steps down (no flicker). */
  recoveryHoldMs?: number;
  /** How long an informational line ("Charging · back to Fast") stays after its action was applied. */
  lingerMs?: number;
  /** Critical heat: weights are unloaded after this long (spec: 60 s). */
  criticalUnloadMs?: number;
  /** Phone/tablet: how long a backgrounded answer may keep running (spec: 15 s). */
  backgroundGraceMs?: number;
}
