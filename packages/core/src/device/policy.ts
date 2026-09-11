import type { Action, Button, GuardDeviceClass, DeviceSignals, Grade, ModelTier, PolicyOptions, Recommendation, Status, UserOverride } from "./types";

/** Product names on the cartridges (§6.1); they are not translated. */
export const TIER_NAMES: Record<ModelTier, string> = { apple: "Apple", instant: "Instant", fast: "Fast", sharp: "Sharp", power: "Power", studio: "Studio" };
const LADDER: ModelTier[] = ["apple", "instant", "fast", "sharp", "power", "studio"];

/** Where a smaller model goes: phones drop straight to Instant, laptops one step down and never below Fast (§6.5). */
export function tierBelow(tier: ModelTier, deviceClass: GuardDeviceClass): ModelTier | null {
  const i = LADDER.indexOf(tier);
  if (i <= 1) return null;
  if (deviceClass === "phone" || deviceClass === "tablet") return "instant";
  const floor = deviceClass === "laptop" ? LADDER.indexOf("fast") : LADDER.indexOf("instant");
  return i - 1 >= floor ? (LADDER[i - 1] ?? null) : null;
}

/** S52 defaults: Auto power management is on for phones and laptops, off on a desk-bound computer. */
export function defaultOverride(deviceClass: GuardDeviceClass): UserOverride {
  return { autoPowerManagement: deviceClass !== "desktop", neverSwitchModel: false, profile: "balanced" };
}

/** Every i18n key a Recommendation can carry; the locale test checks each exists in en.json. */
export const HEADLINE_KEYS = {
  batteryPropose: "device.battery.propose",
  batterySwitched: "device.battery.switched",
  batteryAlreadySmallest: "device.battery.alreadySmallest",
  batteryCritical: "device.battery.critical",
  batterySwitchBack: "device.battery.switchBack",
  browserBattery: "device.browser.battery",
  lowPowerPropose: "device.lowPower.propose",
  lowPowerSwitched: "device.lowPower.switched",
  lowPowerAlreadySmallest: "device.lowPower.alreadySmallest",
  chargingRestored: "device.charging.restored",
  thermalSlowingPhone: "chat.thermal.slowing",
  thermalSlowingComputer: "device.thermal.slowingComputer",
  thermalStoppedPhone: "device.thermal.stoppedPhone",
  thermalStoppedComputer: "device.thermal.stoppedComputer",
  throttling: "device.throttling",
  memorySwitched: "device.memory.switched",
  memoryStopped: "device.memory.stopped",
  memoryPropose: "device.memory.propose",
  paused: "device.paused",
} as const;

export const BUTTON_KEYS: Record<Button, string> = {
  switch: "device.button.switch",
  switchBack: "device.button.switchBack",
  switchBackTo: "device.button.switchBackTo",
  keep: "device.button.keep",
  continue: "device.button.continue",
  continueWhenCool: "device.button.continueWhenCool",
  answerAnyway: "device.button.answerAnyway",
  switchSmaller: "device.button.switchSmaller",
  switchTo: "device.button.switchTo",
};

/** Severity for the priority rule (§6.5): critical heat, memory, serious heat, <5 %, Low Power/<10 %, proposals. */
const RANK: Record<Status, number> = {
  normal: 0,
  recovered: 1,
  memoryBack: 1,
  batteryLow: 1,
  throttling: 1,
  charging: 2,
  lowPower: 3,
  batteryCritical: 4,
  thermalSerious: 5,
  paused: 6,
  memory: 7,
  thermalCritical: 8,
};

const ANSWER_CAP = 1024;
const SAVING_CAP = 512;

type Accepted = { kind: "none" } | { kind: "switch"; tier: ModelTier } | { kind: "continue" } | { kind: "answerAnyway" };

interface Memory {
  status: Status;
  candidate: Status;
  candidateSince: number;
  autoSwitch: { from: ModelTier; to: ModelTier; reason: "battery" | "memory" } | null;
  keptSmaller: boolean;
  userSwitchedBack: boolean;
  offered: Set<Status>;
  hidden: Set<Status>;
  batteryStep: 0 | 1 | 2 | 3;
  criticalPending: boolean;
  pausedPending: boolean;
  restoredAt: number | null;
  explained: boolean;
  longAnswerAllowedUntil: number;
}

const fresh = (): Memory => ({
  status: "normal",
  candidate: "normal",
  candidateSince: 0,
  autoSwitch: null,
  keptSmaller: false,
  userSwitchedBack: false,
  offered: new Set(),
  hidden: new Set(),
  batteryStep: 0,
  criticalPending: false,
  pausedPending: false,
  restoredAt: null,
  explained: false,
  longAnswerAllowedUntil: 0,
});

const pct = (level: number | null): number => Math.round((level ?? 0) * 100);
const isCharging = (s: DeviceSignals): boolean => s.battery.state === "charging" || s.battery.state === "full" || s.powerSource === "ac";

/**
 * Stateful policy: feed it the merged device signals and it answers with exactly one status line and one action,
 * per the §6.5 table. Escalation is immediate; stepping down waits `recoveryHoldMs` so the line does not flicker,
 * and a proposal is shown once per step (until the step is left and re-entered).
 */
export class DevicePolicy {
  private mem = fresh();
  private last: Recommendation | null = null;
  private skipHold = false;
  private readonly recoveryHoldMs: number;
  private readonly lingerMs: number;
  private readonly criticalUnloadMs: number;
  private readonly backgroundGraceMs: number;

  constructor(opts: PolicyOptions = {}) {
    this.recoveryHoldMs = opts.recoveryHoldMs ?? 20_000;
    this.lingerMs = opts.lingerMs ?? 10_000;
    this.criticalUnloadMs = opts.criticalUnloadMs ?? 60_000;
    this.backgroundGraceMs = opts.backgroundGraceMs ?? 15_000;
  }

  get current(): Recommendation | null {
    return this.last;
  }

  update(s: DeviceSignals, o: UserOverride, now: number): Recommendation {
    const m = this.mem;
    this.trackBatteryStep(s, o);
    const raw = this.classify(s, o, now);
    let status: Status;
    /* Only sensor-driven states wait out the hold; a charger, a threshold with hysteresis or a tap applies at once. */
    const held = (m.status === "thermalSerious" || m.status === "memory" || m.status === "thermalCritical") && !this.skipHold;
    this.skipHold = false;
    if (RANK[raw] >= RANK[m.status] || !held) {
      status = raw;
      m.candidate = raw;
      m.candidateSince = now;
    } else {
      if (raw !== m.candidate) {
        m.candidate = raw;
        m.candidateSince = now;
      }
      status = now - m.candidateSince >= this.recoveryHoldMs ? raw : m.status;
    }
    /* A step the user left (charging, warmed up, memory back) opens the door for its proposal next time. */
    for (const st of [...m.offered]) if (!this.stepHolds(st, s, o, now)) m.offered.delete(st);
    for (const st of [...m.hidden]) if (!this.stepHolds(st, s, o, now)) m.hidden.delete(st);
    if (status !== m.status) {
      if (status === "thermalCritical") m.criticalPending = true;
      if (status === "paused") m.pausedPending = true;
      if (m.status === "lowPower" || m.status === "batteryCritical") m.userSwitchedBack = false;
    }
    m.status = status;
    const rec = this.render(status, s, o, now);
    if (rec.recommendation === "act" && rec.action === "switchToSmaller" && rec.targetTier && !m.explained) {
      rec.explain = true;
      m.explained = true;
    }
    this.last = rec;
    return rec;
  }

  /** The status-line button was pressed. Tells the caller what to do; the policy records the choice. */
  accept(now: number): Accepted {
    const m = this.mem;
    const rec = this.last;
    if (!rec) return { kind: "none" };
    m.offered.add(rec.status);
    this.skipHold = true;
    switch (rec.button) {
      case "switch":
      case "switchTo":
      case "switchSmaller":
        return rec.targetTier ? { kind: "switch", tier: rec.targetTier } : { kind: "none" };
      case "switchBack":
      case "switchBackTo": {
        const from = m.autoSwitch?.from;
        m.autoSwitch = null;
        m.userSwitchedBack = true;
        return from ? { kind: "switch", tier: from } : { kind: "none" };
      }
      case "keep":
        m.keptSmaller = true;
        m.autoSwitch = null;
        return { kind: "none" };
      case "continue":
        m.criticalPending = false;
        m.pausedPending = false;
        return { kind: "continue" };
      case "answerAnyway":
        m.longAnswerAllowedUntil = now + 60_000;
        return { kind: "answerAnyway" };
      default:
        return { kind: "none" };
    }
  }

  /** The line was closed without pressing its button: hide it for this step, keep the protections. */
  dismiss(): void {
    const st = this.last?.status;
    if (!st || st === "normal") return;
    this.mem.offered.add(st);
    this.mem.hidden.add(st);
    this.skipHold = true;
    if (st === "paused") this.mem.pausedPending = false;
  }

  /** The engine switched models. `auto` records the switch so charging can bring the previous model back. */
  noteSwitched(from: ModelTier, to: ModelTier, auto: boolean, reason: "battery" | "memory" = "battery"): void {
    const m = this.mem;
    if (auto) {
      m.autoSwitch = { from: m.autoSwitch?.from ?? from, to, reason };
      m.keptSmaller = false;
    }
  }

  /** The automatic restore ("Charging · back to Fast") was applied. */
  noteRestored(now: number): void {
    this.mem.autoSwitch = null;
    this.mem.restoredAt = now;
  }

  reset(): void {
    this.mem = fresh();
    this.last = null;
  }

  /* A tier nothing is installed for cannot be switched to (Instant not yet delivered): the row falls back to its "already smallest" line. */
  private target(s: DeviceSignals): ModelTier | null {
    const below = tierBelow(s.currentTier, s.deviceClass);
    return below && s.availableTiers && !s.availableTiers.includes(below) ? null : below;
  }

  private batteryLogic(s: DeviceSignals, o: UserOverride): boolean {
    const c = s.deviceClass;
    return o.autoPowerManagement && c !== "desktop" && c !== "browser";
  }

  /* Thresholds carry 2 points of hysteresis on the way up so 9.9 % ↔ 10.1 % cannot toggle the line. */
  private trackBatteryStep(s: DeviceSignals, o: UserOverride): void {
    const m = this.mem;
    const level = s.battery.level;
    if (!this.batteryLogic(s, o) || level === null || isCharging(s)) {
      m.batteryStep = 0;
      return;
    }
    const propose = s.deviceClass === "tablet" ? 0.15 : 0.2;
    const step = (t: number, keep: 1 | 2 | 3) => level <= t + (m.batteryStep >= keep ? 0.02 : 0);
    m.batteryStep = step(0.05, 3) ? 3 : step(0.1, 2) ? 2 : step(propose, 1) ? 1 : 0;
  }

  private classify(s: DeviceSignals, o: UserOverride, now: number): Status {
    const m = this.mem;
    const c = s.deviceClass;
    const mobile = c === "phone" || c === "tablet";
    if (s.thermal === "critical" || m.criticalPending) return "thermalCritical";
    if (s.memoryPressure === "warning" || s.memoryPressure === "critical") return "memory";
    if (m.pausedPending || (mobile && s.pausedInBackground)) return "paused";
    if (mobile && s.generating && s.backgroundedForMs !== null && s.backgroundedForMs >= this.backgroundGraceMs) return "paused";
    if (s.thermal === "serious") return "thermalSerious";
    const level = s.battery.level;
    const charging = isCharging(s);
    if (c === "browser") {
      if (level !== null && level <= 0.15 && !charging && !m.offered.has("batteryLow") && this.target(s)) return "batteryLow";
      return "normal";
    }
    if (this.batteryLogic(s, o)) {
      const lpm = s.battery.lowPowerMode === true;
      if (m.batteryStep === 3) return "batteryCritical";
      if (lpm || m.batteryStep === 2) return "lowPower";
      const restorable = m.autoSwitch?.reason === "battery" && !m.keptSmaller;
      if (charging && restorable) return "charging";
      if (m.restoredAt !== null && now - m.restoredAt < this.lingerMs) return "charging";
      if (!charging && restorable && level !== null && level > 0.3 && !m.offered.has("recovered")) return "recovered";
      if (m.batteryStep === 1 && !m.offered.has("batteryLow") && this.target(s)) return "batteryLow";
    }
    /* Memory back: the line the switch left behind stays until the user takes Switch back or dismisses it (§6.5 memory row). */
    if (mobile && m.autoSwitch?.reason === "memory" && m.autoSwitch.to === s.currentTier && !m.keptSmaller && !m.offered.has("memoryBack")) return "memoryBack";
    /* The speed-drop stand-in is a Windows (no thermal API) row; phones and Macs have real thermal signals. */
    if ((c === "desktop" || c === "laptop") && s.throttling && !m.offered.has("throttling") && this.target(s)) return "throttling";
    return "normal";
  }

  /* Whether the step behind a proposal still holds; leaving it re-arms the one-time proposal. */
  private stepHolds(st: Status, s: DeviceSignals, o: UserOverride, now: number): boolean {
    const m = this.mem;
    switch (st) {
      case "batteryLow":
        return s.deviceClass === "browser" ? s.battery.level !== null && s.battery.level <= 0.17 && !isCharging(s) : m.batteryStep >= 1;
      case "lowPower":
        return s.battery.lowPowerMode === true || m.batteryStep >= 2;
      case "batteryCritical":
        return m.batteryStep === 3;
      case "recovered":
        return !isCharging(s) && (s.battery.level ?? 0) > 0.28;
      case "memoryBack":
        return m.autoSwitch?.reason === "memory";
      case "charging":
        return isCharging(s) || (m.restoredAt !== null && now - m.restoredAt < this.lingerMs);
      case "thermalSerious":
        return s.thermal === "serious" || s.thermal === "critical";
      case "thermalCritical":
        return s.thermal === "critical" || m.criticalPending;
      case "throttling":
        return s.throttling;
      case "memory":
        return s.memoryPressure === "warning" || s.memoryPressure === "critical";
      case "paused":
        return m.pausedPending;
      default:
        return false;
    }
  }

  private render(status: Status, s: DeviceSignals, o: UserOverride, now: number): Recommendation {
    const m = this.mem;
    const c = s.deviceClass;
    const mobile = c === "phone" || c === "tablet";
    const base = Math.max(1, o.profile === "eco" ? s.baseThreads - 1 : s.baseThreads);
    const rec: Recommendation = {
      status,
      headline: null,
      headlineParams: {},
      recommendation: "none",
      action: "none",
      button: null,
      buttonParams: {},
      targetTier: null,
      threads: s.thermal === "fair" ? Math.max(1, base - 1) : base,
      gpuLayers: null,
      maxTokens: ANSWER_CAP,
      contextCap: s.ramGB !== null && s.ramGB < 6 ? 2048 : 4096,
      pauseDownloads: false,
      pauseIndexing: false,
      sealGlow: true,
      confirmLongAnswer: false,
      stopGeneration: false,
      unloadAfterMs: null,
      explain: false,
    };
    const level = pct(s.battery.level);
    const target = this.target(s);
    const targetName = target ? TIER_NAMES[target] : "";
    const line = (key: string, params: Record<string, string | number> = {}) => {
      rec.headline = key;
      rec.headlineParams = params;
    };
    const button = (b: Button, params: Record<string, string | number> = {}) => {
      rec.button = b;
      rec.buttonParams = params;
    };
    const grade = (g: Grade, a: Action, tier: ModelTier | null = null) => {
      rec.recommendation = g;
      rec.action = a;
      rec.targetTier = tier;
    };
    const saving = () => {
      rec.maxTokens = SAVING_CAP;
      rec.pauseDownloads = true;
      rec.pauseIndexing = true;
      rec.sealGlow = false;
    };
    /* Low Power / <10 %: act on a phone (Instant), one step down on a laptop; already-smallest gets only the savings. */
    const powerSaving = (lpm: boolean) => {
      saving();
      const switched = m.autoSwitch !== null && m.autoSwitch.to === s.currentTier;
      if (switched) {
        grade("act", "none");
        line(lpm ? HEADLINE_KEYS.lowPowerSwitched : HEADLINE_KEYS.batterySwitched, { level, model: TIER_NAMES[s.currentTier] });
        button("switchBack", { model: TIER_NAMES[m.autoSwitch?.from ?? s.currentTier] });
      } else if (!target || m.userSwitchedBack) {
        grade("act", "none");
        line(lpm ? HEADLINE_KEYS.lowPowerAlreadySmallest : HEADLINE_KEYS.batteryAlreadySmallest, { level });
      } else if (o.neverSwitchModel) {
        grade("propose", "suggestSmallerModel", target);
        line(lpm ? HEADLINE_KEYS.lowPowerPropose : HEADLINE_KEYS.batteryPropose, { level, model: targetName });
        button("switch");
      } else {
        grade("act", "switchToSmaller", target);
        line(lpm ? HEADLINE_KEYS.lowPowerSwitched : HEADLINE_KEYS.batterySwitched, { level, model: targetName });
        button("switchBack", { model: TIER_NAMES[s.currentTier] });
      }
    };
    switch (status) {
      case "normal":
        break;
      case "batteryLow":
        grade("propose", "suggestSmallerModel", target);
        if (c === "browser") {
          line(HEADLINE_KEYS.browserBattery, { level });
          button("switchSmaller");
        } else {
          line(HEADLINE_KEYS.batteryPropose, { level, model: targetName });
          button("switch");
        }
        break;
      case "lowPower":
        powerSaving(s.battery.lowPowerMode === true);
        break;
      case "batteryCritical":
        powerSaving(s.battery.lowPowerMode === true);
        rec.confirmLongAnswer = now >= m.longAnswerAllowedUntil;
        line(HEADLINE_KEYS.batteryCritical, { level });
        button("answerAnyway");
        break;
      case "charging":
        if (m.autoSwitch) {
          grade("act", "switchBack", m.autoSwitch.from);
          line(HEADLINE_KEYS.chargingRestored, { model: TIER_NAMES[m.autoSwitch.from] });
          button("keep", { model: TIER_NAMES[m.autoSwitch.to] });
        } else {
          line(HEADLINE_KEYS.chargingRestored, { model: TIER_NAMES[s.currentTier] });
        }
        break;
      case "recovered":
        grade("propose", "switchBack", m.autoSwitch?.from ?? null);
        line(HEADLINE_KEYS.batterySwitchBack, { level });
        button("switchBackTo", { model: TIER_NAMES[m.autoSwitch?.from ?? s.currentTier] });
        break;
      case "thermalSerious":
        grade("act", "throttleThreads", target);
        rec.threads = Math.max(1, Math.ceil(base / 2));
        rec.gpuLayers = 49;
        saving();
        rec.sealGlow = true;
        line(mobile ? HEADLINE_KEYS.thermalSlowingPhone : HEADLINE_KEYS.thermalSlowingComputer);
        if (target) button("switchTo", { model: targetName });
        break;
      case "thermalCritical":
        grade("act", s.generating ? "pauseGeneration" : "unloadModel");
        rec.threads = Math.max(1, Math.ceil(base / 2));
        rec.gpuLayers = 49;
        saving();
        rec.stopGeneration = true;
        rec.unloadAfterMs = this.criticalUnloadMs;
        line(mobile ? HEADLINE_KEYS.thermalStoppedPhone : HEADLINE_KEYS.thermalStoppedComputer);
        button(s.thermal === "critical" ? "continueWhenCool" : "continue");
        break;
      case "throttling":
        grade("propose", "suggestSmallerModel", target);
        line(HEADLINE_KEYS.throttling);
        button("switchSmaller");
        break;
      case "memory":
        if (mobile) {
          rec.stopGeneration = true;
          rec.unloadAfterMs = 0;
          saving();
          const switched = m.autoSwitch?.reason === "memory" && m.autoSwitch.to === s.currentTier;
          if (switched) {
            grade("act", "unloadModel");
            line(HEADLINE_KEYS.memorySwitched, { model: TIER_NAMES[s.currentTier] });
            button("switchBack", { model: TIER_NAMES[m.autoSwitch?.from ?? s.currentTier] });
          } else if (target && !o.neverSwitchModel) {
            grade("act", "switchToSmaller", target);
            line(HEADLINE_KEYS.memorySwitched, { model: targetName });
            button("switchBack", { model: TIER_NAMES[s.currentTier] });
          } else if (target) {
            grade("propose", "suggestSmallerModel", target);
            line(HEADLINE_KEYS.memoryPropose);
            button("switchSmaller");
          } else {
            grade("act", "unloadModel");
            line(HEADLINE_KEYS.memoryStopped);
          }
        } else {
          grade("propose", "suggestSmallerModel", target);
          line(HEADLINE_KEYS.memoryPropose);
          if (target) button("switchSmaller");
        }
        break;
      case "memoryBack":
        grade("propose", "switchBack", m.autoSwitch?.from ?? null);
        line(HEADLINE_KEYS.memorySwitched, { model: TIER_NAMES[s.currentTier] });
        button("switchBack", { model: TIER_NAMES[m.autoSwitch?.from ?? s.currentTier] });
        break;
      case "paused":
        grade("act", "pauseGeneration");
        rec.stopGeneration = true;
        line(HEADLINE_KEYS.paused);
        button("continue");
        break;
    }
    if (m.hidden.has(status)) {
      rec.headline = null;
      rec.button = null;
    }
    return rec;
  }
}
