import { AppState, type AppStateStatus } from "react-native";
import {
  DevicePolicy,
  SpeedWatch,
  defaultOverride,
  memoryPressureFromAndroid,
  type BatterySignal,
  type DeviceSignals,
  type MemoryPressure,
  type ModelTier,
  type PowerSource,
  type Recommendation,
  type SwitchReason,
  type ThermalState,
  type Tier,
  type UserOverride,
} from "@inborn/core";
import {
  getEngineState,
  getUnloadReason,
  isGenerating,
  loadSession,
  noteBackground,
  noteForeground,
  peekEngine,
  consumePausedByGuard,
  setGenerationCaps,
  setPauseCheck,
  stopGeneration,
  subscribeActivity,
  subscribeEngineState,
  switchModel,
  unloadSession,
  type EngineState,
} from "../engine";
import { isAndroidSnapshot } from "../../modules/device-guard";
import { getVault } from "../vault/store";
import { getPausedTurn, subscribePausedTurn } from "../lib/pausedTurn";
import { loadPrefs, savePrefs, writeDevSnapshot } from "./prefs";
import { MEMORY_RECOVERY_MS, memoryHealthy, readSignals, setCurrentSignals, snapshot, subscribeSignals, type RawSignals } from "./signals";
/** The guard's own view in the policy's types; mapState.ts turns it into the shell's DeviceState. */
export interface GuardState {
  battery: BatterySignal;
  thermal: ThermalState;
  memoryPressure: MemoryPressure;
  powerSource: PowerSource;
  recommendation: Recommendation;
  deviceClass: RawSignals["deviceClass"];
  ramGB: number | null;
  override: UserOverride;
  engine: EngineState;
  /** First automatic switch of the run: the shell shows the explainer sheet once, then calls ackExplain(). */
  explain: boolean;
}

const DEBOUNCE_MS = 250;
const PRESSURE_RANK: Record<MemoryPressure, number> = { unknown: 0, normal: 0, warning: 1, critical: 2 };
const TICK_MS = 5_000;
/** §6.5: a backgrounded answer on a phone may run this long before it is paused. */
const BACKGROUND_GRACE_MS = 15_000;
const tierOf = (modelId: string): ModelTier => (["instant", "fast", "sharp", "power", "apple"] as ModelTier[]).find((t) => t === modelId) ?? "instant";

/**
 * The one place device signals meet the policy (spec §6.5) and the engine: merges every source, debounces, evaluates,
 * and carries out "act" recommendations between answers (caps, stop, unload, switch). The UI reads it through useDeviceState.
 */
class DeviceGuard {
  private readonly policy = new DevicePolicy();
  private readonly speed = new SpeedWatch();
  private raw: RawSignals | null = null;
  private override: UserOverride = defaultOverride("phone");
  private explained = false;
  private explain = false;
  private backgroundedAt: number | null = null;
  private memorySince: number | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private criticalUnload: ReturnType<typeof setTimeout> | null = null;
  private pendingSwitch: { tier: Tier; auto: boolean; restore: boolean } | null = null;
  private triedSwitch: string | null = null;
  private state: GuardState | null = null;
  private tiers: (() => ModelTier[]) | null = null;
  private readonly listeners = new Set<() => void>();
  private started = false;
  private stopSources: (() => void)[] = [];

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    this.start();
    return () => void this.listeners.delete(l);
  };

  getState = (): GuardState | null => this.state;

  /** The status-line button. */
  accept = (): void => {
    const now = Date.now();
    const a = this.policy.accept(now);
    if (a.kind === "switch") this.queueSwitch(a.tier as Tier, false, false);
    else if (a.kind === "continue" && getEngineState() === "unloaded" && getUnloadReason() !== "idle") void loadSession().catch(() => undefined);
    this.evaluate();
  };

  dismiss = (): void => {
    this.policy.dismiss();
    this.evaluate();
  };

  /** The shell's three §8.8 buttons: act on the line when it offers that action, otherwise do the plain thing. */
  switchToInstant = (): void => {
    const b = this.policy.current?.button;
    if (b === "switch" || b === "switchTo" || b === "switchSmaller") return this.accept();
    this.queueSwitch("instant", false, false);
    this.evaluate();
  };

  switchBack = (): void => {
    const b = this.policy.current?.button;
    if (b === "switchBack" || b === "switchBackTo" || b === "keep") this.accept();
  };

  continueGeneration = (): void => {
    if (this.policy.current?.button === "continue") this.accept();
  };

  /* The paused status latches until Continue, so once the partial answer it kept is gone it would sit on every later chat and mask the other §8.8 lines (QA F28). */
  dismissPaused = (): void => {
    if (this.policy.current?.status !== "paused") return;
    this.policy.dismiss();
    this.evaluate();
  };

  ackExplain = (): void => {
    this.explain = false;
    this.publish();
  };

  setOverride = (patch: Partial<UserOverride>): void => {
    this.override = { ...this.override, ...patch };
    savePrefs({ ...this.override, explained: this.explained });
    this.evaluate();
  };

  /** The boot-time RAM floor started Instant instead of the vault default (§6.5): the line says the model does not fit and offers the way back. */
  noteBootSwitch = (from: ModelTier): void => {
    this.policy.noteSwitched(from, "instant", true, "fit");
    this.evaluate();
  };

  /** Which chat tiers are installed right now; the policy never proposes or applies a switch towards a missing one. */
  setAvailableTiers = (provider: (() => ModelTier[]) | null): void => {
    this.tiers = provider;
  };

  /** Feed the tok/s of every finished answer (Windows throttling stand-in, §6.5). */
  noteSpeed = (tokPerSec: number): void => {
    this.speed.sample(tokPerSec, Date.now());
  };

  private start(): void {
    if (this.started) return;
    this.started = true;
    void readSignals().then((raw) => {
      this.raw = raw;
      setCurrentSignals(raw);
      const prefs = loadPrefs();
      this.explained = prefs.explained === true;
      this.override = { ...defaultOverride(raw.deviceClass), ...prefs };
      this.stopSources.push(
        subscribeSignals((patch) => this.patch(patch)),
        AppState.addEventListener("change", (s: AppStateStatus) => {
          const bg = s !== "active";
          if (bg && this.backgroundedAt === null) {
            this.backgroundedAt = Date.now();
            noteBackground();
          } else if (!bg && this.backgroundedAt !== null) {
            this.backgroundedAt = null;
            this.pausedInBackground = consumePausedByGuard();
            noteForeground();
          }
          this.schedule();
        }).remove,
        subscribeActivity((busy) => {
          if (!busy) {
            this.noteSpeed(peekEngine()?.engine.stats().tokPerSec ?? 0);
            void this.applyPendingSwitch();
          }
          this.schedule();
        }),
        subscribeEngineState(() => this.publish()),
        subscribePausedTurn(() => {
          if (getPausedTurn() === null) this.dismissPaused();
        }),
      );
      const mobile = raw.deviceClass === "phone" || raw.deviceClass === "tablet";
      setPauseCheck(() => mobile && this.backgroundedAt !== null && Date.now() - this.backgroundedAt >= BACKGROUND_GRACE_MS);
      this.ticker = setInterval(() => this.tick(), TICK_MS);
      this.evaluate();
    });
  }

  private patch(p: Partial<RawSignals>): void {
    if (!this.raw) return;
    if (p.memoryPressure === "warning" || p.memoryPressure === "critical") this.memorySince = Date.now();
    this.raw = { ...this.raw, ...p };
    setCurrentSignals(this.raw);
    this.schedule();
  }

  /** Bytes of the model the engine is mapping or holds mapped, null while nothing is resident (a load that thrashes is caught too). */
  private residentBytes(): number | null {
    if (getEngineState() === "unloaded") return null;
    const id = peekEngine()?.model.id;
    if (!id) return null;
    const s = getVault().state(id);
    return s.kind === "ready" || s.kind === "quarantined" ? s.bytes : null;
  }

  /* Memory pressure arrives as an edge (onTrimMemory), which Android withholds from the foreground app while it evicts the
     mapped weights instead; every tick also reads availMem against the resident model (§6.5 Android row). */
  private tick(): void {
    const s = snapshot();
    const polled = s && isAndroidSnapshot(s) ? memoryPressureFromAndroid({ availMem: s.availMem, threshold: s.threshold, lowMemory: s.lowMemory }, this.residentBytes()) : "normal";
    if (this.raw && PRESSURE_RANK[polled] > PRESSURE_RANK[this.raw.memoryPressure]) {
      this.patch({ memoryPressure: polled });
      return;
    }
    if (this.raw && this.memorySince !== null && Date.now() - this.memorySince >= MEMORY_RECOVERY_MS) {
      if (s && memoryHealthy(s) && polled === "normal") {
        this.memorySince = null;
        this.raw = { ...this.raw, memoryPressure: "normal" };
        setCurrentSignals(this.raw);
      } else this.memorySince = Date.now();
    }
    this.evaluate();
  }

  private schedule(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      this.evaluate();
    }, DEBOUNCE_MS);
  }

  private signals(): DeviceSignals | null {
    if (!this.raw) return null;
    const now = Date.now();
    return {
      ...this.raw,
      /* While weights are being swapped the policy still sees the old tier, so the line does not flicker mid-switch. */
      currentTier: this.switching ? this.switchFrom : tierOf(peekEngine()?.model.id ?? "instant"),
      generating: isGenerating(),
      backgroundedForMs: this.backgroundedAt === null ? null : now - this.backgroundedAt,
      pausedInBackground: this.pausedInBackground,
      throttling: this.speed.isThrottling(now),
      ...(this.tiers ? { availableTiers: this.tiers() } : {}),
    };
  }

  private evaluate(): void {
    const s = this.signals();
    if (!s) return;
    const before = this.policy.current;
    const rec = this.policy.update(s, this.override, Date.now());
    this.pausedInBackground = false;
    this.apply(rec, before, s);
    this.publish();
  }

  private apply(rec: Recommendation, before: Recommendation | null, s: DeviceSignals): void {
    setGenerationCaps({ maxTokens: rec.maxTokens, threads: rec.threads, gpuLayers: rec.gpuLayers, nCtx: rec.contextCap });
    if (rec.stopGeneration && isGenerating()) stopGeneration();
    if (rec.unloadAfterMs === 0 && getEngineState() !== "unloaded") void unloadSession(rec.status === "memory" ? "memory" : "critical");
    else if (rec.unloadAfterMs && rec.status === "thermalCritical" && !this.criticalUnload) {
      this.criticalUnload = setTimeout(() => {
        this.criticalUnload = null;
        if (this.policy.current?.status === "thermalCritical") void unloadSession("critical");
      }, rec.unloadAfterMs);
    }
    if (rec.status !== "thermalCritical" && this.criticalUnload) {
      clearTimeout(this.criticalUnload);
      this.criticalUnload = null;
    }
    if (rec.explain && !this.explained) {
      this.explained = true;
      this.explain = true;
      savePrefs({ ...this.override, explained: true });
    }
    if (rec.recommendation === "act" && rec.action === "switchToSmaller" && rec.targetTier && rec.targetTier !== "apple") {
      const key = `${rec.status}:${rec.targetTier}`;
      if (this.triedSwitch !== key) {
        this.triedSwitch = key;
        this.queueSwitch(rec.targetTier, true, false, rec.status === "memory" ? "memory" : "battery", s.currentTier);
      }
    } else if (rec.recommendation === "act" && rec.action === "switchBack" && rec.targetTier && rec.targetTier !== "apple") {
      this.queueSwitch(rec.targetTier, true, true);
    } else if (before?.status !== rec.status) this.triedSwitch = null;
  }

  /* Model switches wait for the answer in flight (§6.5: "from the next message"). */
  private queueSwitch(tier: Tier, auto: boolean, restore: boolean, reason: SwitchReason = "battery", from?: ModelTier): void {
    this.pendingSwitch = { tier, auto, restore };
    this.switchReason = reason;
    this.switchFrom = from ?? tierOf(peekEngine()?.model.id ?? "instant");
    if (!isGenerating()) void this.applyPendingSwitch();
  }

  private switchReason: SwitchReason = "battery";
  private switchFrom: ModelTier = "instant";
  private switching = false;
  private pausedInBackground = false;

  private async applyPendingSwitch(): Promise<void> {
    const p = this.pendingSwitch;
    if (!p) return;
    this.pendingSwitch = null;
    this.switching = true;
    try {
      /* Memory pressure unloads right away: the smaller model waits for the next message instead of loading now. */
      const ok = await switchModel(p.tier, this.policy.current?.unloadAfterMs !== 0);
      if (!ok) {
        if (__DEV__) console.log(`[inborn] no ${p.tier} model to switch to`);
        return;
      }
      if (p.restore) this.policy.noteRestored(Date.now());
      else if (p.auto) this.policy.noteSwitched(this.switchFrom, p.tier, true, this.switchReason);
    } catch (e: unknown) {
      console.warn("[inborn] model switch failed", e);
    } finally {
      this.switching = false;
    }
    this.evaluate();
  }

  private publish(): void {
    const rec = this.policy.current;
    if (!this.raw || !rec) return;
    /* Dev builds: the first read lands in Documents/device-guard.json, the README's measurement channel where no console is readable (iOS). */
    if (__DEV__ && !this.state) writeDevSnapshot({ ...this.raw, snapshot: snapshot(), status: rec.status, at: new Date().toISOString() });
    if (__DEV__ && (rec.status !== this.state?.recommendation.status || rec.headline !== this.state?.recommendation.headline || rec.button !== this.state?.recommendation.button)) {
      console.log(`[device] ${rec.status} · ${rec.headline ?? "—"} ${JSON.stringify(rec.headlineParams)} · ${rec.recommendation}/${rec.action} · button=${rec.button} · threads=${rec.threads} maxTokens=${rec.maxTokens} · ${this.raw.thermal}/${this.raw.memoryPressure}/${Math.round((this.raw.battery.level ?? 0) * 100)}%/${this.raw.battery.state}/lpm=${this.raw.battery.lowPowerMode}`);
    }
    this.state = {
      battery: this.raw.battery,
      thermal: this.raw.thermal,
      memoryPressure: this.raw.memoryPressure,
      powerSource: this.raw.powerSource,
      recommendation: rec,
      deviceClass: this.raw.deviceClass,
      ramGB: this.raw.ramGB,
      override: this.override,
      engine: getEngineState(),
      explain: this.explain,
    };
    for (const l of this.listeners) l();
  }
}

let guard: DeviceGuard | null = null;
export const getDeviceGuard = (): DeviceGuard => (guard ??= new DeviceGuard());
