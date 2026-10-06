import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSignals } from "./signals";

/* Round 134E: build 38, iPhone 13 Pro. A memory warning switched Fast to Instant, and the guard then stopped every answer
   Instant began for the next ~50 s ("The" · stopped, then a turn with 0 tokens and no row). */

const engine = vi.hoisted(() => {
  const e = {
    model: "fast",
    state: "loaded" as "unloaded" | "loading" | "loaded",
    generating: false,
    vision: false,
    tokPerSec: 12,
    guardStop: false,
    stops: 0,
    unloads: [] as string[],
    switches: [] as string[],
    releases: 0,
    activity: new Set<(busy: boolean) => void>(),
  };
  return e;
});

const signals = vi.hoisted(() => ({ onPatch: null as ((p: Partial<RawSignals>) => void) | null }));

vi.mock("react-native", () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock("../../modules/device-guard", () => ({ isAndroidSnapshot: () => false }));
vi.mock("../../modules/background-task", () => ({ backgroundTask: { begin: () => -1, end() {} }, onBackgroundTaskExpire: () => () => undefined }));
vi.mock("../vault/store", () => ({ getVault: () => ({ state: () => ({ kind: "ready", bytes: 1 }) }) }));
vi.mock("./prefs", () => ({ loadPrefs: () => ({}), savePrefs() {}, writeDevSnapshot() {} }));
vi.mock("./signals", () => ({
  MEMORY_RECOVERY_MS: 30_000,
  memoryHealthy: () => true,
  setCurrentSignals() {},
  snapshot: () => null,
  readSignals: async (): Promise<RawSignals> => ({
    battery: { level: 0.8, state: "unplugged", lowPowerMode: false },
    thermal: "nominal",
    memoryPressure: "normal",
    powerSource: "battery",
    deviceClass: "phone",
    ramGB: 6,
    baseThreads: 4,
  }),
  subscribeSignals: (l: (p: Partial<RawSignals>) => void) => {
    signals.onPatch = l;
    return () => undefined;
  },
}));
vi.mock("../engine", () => ({
  getEngineState: () => engine.state,
  getUnloadReason: () => null,
  isGenerating: () => engine.generating,
  loadSession: async () => undefined,
  noteBackground() {},
  noteForeground() {},
  peekEngine: () => ({ model: { id: engine.model }, engine: { stats: () => ({ tokPerSec: engine.tokPerSec }), capabilities: () => ({ vision: engine.vision }) } }),
  clearVisionEased() {},
  consumePausedByGuard: () => false,
  releaseVision: async () => {
    engine.releases++;
    engine.vision = false;
    return true;
  },
  setGenerationCaps() {},
  setPauseCheck() {},
  stopGeneration: () => {
    engine.stops++;
    engine.guardStop = true;
  },
  subscribeActivity: (l: (busy: boolean) => void) => {
    engine.activity.add(l);
    return () => engine.activity.delete(l);
  },
  subscribeEngineState: () => () => undefined,
  switchModel: async (tier: string) => {
    engine.switches.push(tier);
    engine.model = tier;
    return true;
  },
  unloadSession: async (reason: string) => {
    engine.unloads.push(reason);
    engine.state = "unloaded";
  },
  wasStoppedByGuard: () => engine.guardStop,
}));

const freshGuard = async () => {
  vi.resetModules();
  return (await import("./guard")).getDeviceGuard();
};

const busy = (b: boolean) => {
  engine.generating = b;
  for (const l of engine.activity) l(b);
};
const settle = async (ms = 300) => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe("the device guard after a memory switch (round 134E)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  });
  afterEach(() => vi.useRealTimers());

  it("stops the answer once for the warning, then lets the switched model answer the next message", async () => {
    const guard = await freshGuard();
    guard.setAvailableTiers(() => ["instant", "fast"]);
    guard.subscribe(() => undefined);
    await settle();
    busy(true);
    signals.onPatch?.({ memoryPressure: "warning" });
    await settle();
    expect(engine.stops).toBe(1);
    expect(engine.unloads).toEqual(["memory"]);
    busy(false);
    await settle();
    expect(engine.switches).toEqual(["instant"]);
    expect(guard.getState()?.recommendation.headline).toBe("device.memory.switched");

    /* The next message, well inside the memory hold: Instant loads and generates, and nothing stops or unloads it. */
    engine.guardStop = false;
    engine.state = "loaded";
    busy(true);
    await settle(6_000);
    expect(engine.stops).toBe(1);
    expect(engine.unloads).toEqual(["memory"]);

    /* It finished on Instant: the "Ran out of memory" line has said what it had to. */
    busy(false);
    await settle();
    expect(guard.getState()?.recommendation.headline).toBeNull();

    /* A fresh warning is acted on again, and its line is back. */
    busy(true);
    signals.onPatch?.({ memoryPressure: "warning" });
    await settle();
    expect(engine.stops).toBe(2);
    expect(engine.unloads).toEqual(["memory", "memory"]);
    expect(guard.getState()?.recommendation.headline).toBe("device.memory.switched");
    busy(false);
  });

  it("drops the picture projector on the first warning and keeps the model; a second warning soon after switches", async () => {
    Object.assign(engine, { model: "fast", state: "loaded", vision: true, guardStop: false, stops: 0, unloads: [], switches: [], releases: 0 });
    engine.activity.clear();
    const guard = await freshGuard();
    guard.setAvailableTiers(() => ["instant", "fast"]);
    guard.subscribe(() => undefined);
    await settle();
    busy(true);
    signals.onPatch?.({ memoryPressure: "warning" });
    await settle();
    expect({ stops: engine.stops, releases: engine.releases, unloads: engine.unloads, switches: engine.switches }).toEqual({ stops: 1, releases: 1, unloads: [], switches: [] });
    expect(guard.getState()?.memoryPressure).toBe("normal");
    busy(false);
    await settle();

    engine.guardStop = false;
    busy(true);
    signals.onPatch?.({ memoryPressure: "warning" });
    await settle();
    expect(engine.unloads).toEqual(["memory"]);
    busy(false);
    await settle();
    expect(engine.switches).toEqual(["instant"]);
  });
});
