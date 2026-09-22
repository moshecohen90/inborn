import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUTTON_KEYS, DevicePolicy, HEADLINE_KEYS, defaultOverride, tierBelow } from "../src/device";
import type { GuardDeviceClass, DeviceSignals, ModelTier, UserOverride } from "../src/device";

const en = JSON.parse(readFileSync(join(__dirname, "../../i18n/locales/en.json"), "utf8")) as Record<string, string>;

function signals(over: Partial<DeviceSignals> & { level?: number | null; charging?: boolean; lpm?: boolean } = {}): DeviceSignals {
  const { level = 0.8, charging = false, lpm = false, ...rest } = over;
  return {
    battery: { level, state: charging ? "charging" : "unplugged", lowPowerMode: lpm },
    thermal: "nominal",
    memoryPressure: "normal",
    powerSource: charging ? "ac" : "battery",
    deviceClass: "phone",
    ramGB: 8,
    currentTier: "fast",
    generating: false,
    backgroundedForMs: null,
    throttling: false,
    baseThreads: 4,
    ...rest,
  };
}

const MINUTE = 60_000;
const phone = (): UserOverride => defaultOverride("phone");
const run = (p: DevicePolicy, s: DeviceSignals, o: UserOverride = phone(), now = 0) => p.update(s, o, now);

describe("tierBelow", () => {
  it("phones drop straight to Instant, laptops one step and never below Fast", () => {
    expect(tierBelow("power", "phone")).toBe("instant");
    expect(tierBelow("fast", "phone")).toBe("instant");
    expect(tierBelow("instant", "phone")).toBeNull();
    expect(tierBelow("apple", "phone")).toBeNull();
    expect(tierBelow("power", "laptop")).toBe("sharp");
    expect(tierBelow("sharp", "laptop")).toBe("fast");
    expect(tierBelow("fast", "laptop")).toBeNull();
    expect(tierBelow("sharp", "browser")).toBe("fast");
    expect(tierBelow("fast", "desktop")).toBe("instant");
  });
});

describe("§6.5 table — phone column", () => {
  it("normal: above 20 %, not hot → nothing", () => {
    const r = run(new DevicePolicy(), signals({ level: 0.55 }));
    expect(r).toMatchObject({ status: "normal", headline: null, recommendation: "none", action: "none", threads: 4, maxTokens: 1024, contextCap: 4096, sealGlow: true });
  });

  it("20–10 %, not charging → one-time proposal to switch to Instant", () => {
    const p = new DevicePolicy();
    const r = run(p, signals({ level: 0.18 }));
    expect(r).toMatchObject({ status: "batteryLow", recommendation: "propose", action: "suggestSmallerModel", targetTier: "instant", button: "switch" });
    expect(r.headline).toBe(HEADLINE_KEYS.batteryPropose);
    expect(r.headlineParams).toEqual({ level: 18, model: "Instant" });
    expect(r.maxTokens).toBe(1024);
    /* Dismissed once: silent for the rest of this step, re-armed after leaving it. */
    p.dismiss();
    expect(run(p, signals({ level: 0.16 }), phone(), 1).status).toBe("normal");
    expect(run(p, signals({ level: 0.5, charging: true }), phone(), 2).status).toBe("normal");
    expect(run(p, signals({ level: 0.19 }), phone(), 3).status).toBe("batteryLow");
  });

  it("tablet proposes only from 15 %", () => {
    const p = new DevicePolicy();
    expect(run(p, signals({ level: 0.18, deviceClass: "tablet" }), defaultOverride("tablet")).status).toBe("normal");
    expect(run(p, signals({ level: 0.14, deviceClass: "tablet" }), defaultOverride("tablet")).status).toBe("batteryLow");
  });

  it("already on Instant: nothing to propose at 18 %", () => {
    expect(run(new DevicePolicy(), signals({ level: 0.18, currentTier: "instant" })).status).toBe("normal");
  });

  it("below 10 % → act: Instant from the next message, 512-token answers, downloads paused, seal without glow", () => {
    const r = run(new DevicePolicy(), signals({ level: 0.09 }));
    expect(r).toMatchObject({ status: "lowPower", recommendation: "act", action: "switchToSmaller", targetTier: "instant", button: "switchBack", maxTokens: 512, pauseDownloads: true, pauseIndexing: true, sealGlow: false, explain: true });
    expect(r.headline).toBe(HEADLINE_KEYS.batterySwitched);
    expect(r.buttonParams).toEqual({ model: "Fast" });
  });

  it("Low Power Mode at any level → act, with the Low Power line and the explainer only once", () => {
    const p = new DevicePolicy();
    const r = run(p, signals({ level: 0.7, lpm: true }));
    expect(r).toMatchObject({ status: "lowPower", action: "switchToSmaller", headline: HEADLINE_KEYS.lowPowerSwitched, explain: true });
    expect(r.headlineParams).toEqual({ level: 70, model: "Instant" });
    p.noteSwitched("fast", "instant", true);
    const again = run(p, signals({ level: 0.7, lpm: true, currentTier: "instant" }), phone(), 1);
    expect(again).toMatchObject({ status: "lowPower", action: "none", headline: HEADLINE_KEYS.lowPowerSwitched, button: "switchBack", explain: false });
    expect(again.headlineParams.model).toBe("Instant");
  });

  it("a memory eviction does not spend the one explainer the battery switch is owed (F59)", () => {
    const p = new DevicePolicy();
    /* The amber "Ran out of memory · Switched to Instant" line already explains this one. */
    const evicted = run(p, signals({ memoryPressure: "critical" }));
    expect(evicted).toMatchObject({ status: "memory", action: "switchToSmaller", explain: false });
    /* The memory status holds for the recovery window before a lower-ranked one takes over. */
    run(p, signals(), phone(), MINUTE);
    run(p, signals(), phone(), 2 * MINUTE);
    const battery = run(p, signals({ level: 0.09 }), phone(), 3 * MINUTE);
    expect(battery).toMatchObject({ status: "lowPower", action: "switchToSmaller", explain: true });
  });

  it("the explainer fires once per install, whichever screen the user is on", () => {
    const p = new DevicePolicy();
    expect(run(p, signals({ level: 0.09 })).explain).toBe(true);
    p.noteSwitched("fast", "instant", true);
    expect(run(p, signals({ level: 0.09, currentTier: "instant" }), phone(), MINUTE).explain).toBe(false);
    /* Back on the charger, back on Fast, flat again: still no second sheet. */
    run(p, signals({ level: 0.9, charging: true, currentTier: "instant" }), phone(), 2 * MINUTE);
    expect(run(p, signals({ level: 0.09 }), phone(), 3 * MINUTE).explain).toBe(false);
  });

  it("Low Power while already on Instant or Apple → only shorter answers and paused downloads", () => {
    for (const tier of ["instant", "apple"] as ModelTier[]) {
      const r = run(new DevicePolicy(), signals({ level: 0.4, lpm: true, currentTier: tier }));
      expect(r).toMatchObject({ status: "lowPower", action: "none", targetTier: null, headline: HEADLINE_KEYS.lowPowerAlreadySmallest, button: null, maxTokens: 512, pauseDownloads: true });
    }
  });

  it("below 5 %, not charging → confirmation before a long answer, indexing off; 'Answer anyway' allows it once", () => {
    const p = new DevicePolicy();
    const r = run(p, signals({ level: 0.04 }));
    expect(r).toMatchObject({ status: "batteryCritical", confirmLongAnswer: true, pauseIndexing: true, headline: HEADLINE_KEYS.batteryCritical, button: "answerAnyway", action: "switchToSmaller" });
    expect(r.headlineParams).toEqual({ level: 4 });
    expect(p.accept(10)).toEqual({ kind: "answerAnyway" });
    expect(run(p, signals({ level: 0.04 }), phone(), 20).confirmLongAnswer).toBe(false);
    expect(run(p, signals({ level: 0.04 }), phone(), 70_000).confirmLongAnswer).toBe(true);
  });

  it("plugged in after an automatic switch → back to the previous model, with 'Keep Instant'", () => {
    const p = new DevicePolicy();
    run(p, signals({ level: 0.09 }));
    p.noteSwitched("fast", "instant", true);
    const r = run(p, signals({ level: 0.09, charging: true, currentTier: "instant" }), phone(), 1);
    expect(r).toMatchObject({ status: "charging", recommendation: "act", action: "switchBack", targetTier: "fast", headline: HEADLINE_KEYS.chargingRestored, button: "keep" });
    expect(r.headlineParams).toEqual({ model: "Fast" });
    expect(r.buttonParams).toEqual({ model: "Instant" });
    p.noteRestored(2);
    /* The line lingers as information, then the policy goes quiet. */
    expect(run(p, signals({ level: 0.1, charging: true }), phone(), 3)).toMatchObject({ status: "charging", action: "none", button: null });
    expect(run(p, signals({ level: 0.1, charging: true }), phone(), 20_000)).toMatchObject({ status: "normal" });
  });

  it("'Keep Instant' cancels the restore for the rest of the run", () => {
    const p = new DevicePolicy();
    run(p, signals({ level: 0.09 }));
    p.noteSwitched("fast", "instant", true);
    run(p, signals({ level: 0.09, charging: true, currentTier: "instant" }), phone(), 1);
    expect(p.accept(2)).toEqual({ kind: "none" });
    expect(run(p, signals({ level: 0.5, charging: true, currentTier: "instant" }), phone(), 30_000).status).toBe("normal");
    expect(run(p, signals({ level: 0.5, currentTier: "instant" }), phone(), 60_000).status).toBe("normal");
  });

  it("above 30 % without charging after an automatic switch → proposal only: 'Switch back to Fast'", () => {
    const p = new DevicePolicy();
    run(p, signals({ level: 0.09 }));
    p.noteSwitched("fast", "instant", true);
    const r = run(p, signals({ level: 0.34, currentTier: "instant" }), phone(), 30_000);
    expect(r).toMatchObject({ status: "recovered", recommendation: "propose", action: "switchBack", targetTier: "fast", headline: HEADLINE_KEYS.batterySwitchBack, button: "switchBackTo" });
    expect(r.buttonParams).toEqual({ model: "Fast" });
    expect(p.accept(30_001)).toEqual({ kind: "switch", tier: "fast" });
    expect(run(p, signals({ level: 0.34 }), phone(), 30_002).status).toBe("normal");
  });

  it("no battery logic without Auto power management; heat still counts", () => {
    const off: UserOverride = { ...phone(), autoPowerManagement: false };
    expect(run(new DevicePolicy(), signals({ level: 0.04 }), off).status).toBe("normal");
    expect(run(new DevicePolicy(), signals({ level: 0.04, thermal: "serious" }), off).status).toBe("thermalSerious");
  });

  it("'Never switch my model automatically' turns the Low Power action into a proposal; the savings still apply", () => {
    const never: UserOverride = { ...phone(), neverSwitchModel: true };
    const r = run(new DevicePolicy(), signals({ level: 0.5, lpm: true }), never);
    expect(r).toMatchObject({ status: "lowPower", recommendation: "propose", action: "suggestSmallerModel", headline: HEADLINE_KEYS.lowPowerPropose, button: "switch", maxTokens: 512, pauseDownloads: true });
  });

  it("Eco profile runs one thread fewer", () => {
    const eco: UserOverride = { ...phone(), profile: "eco" };
    expect(run(new DevicePolicy(), signals(), eco).threads).toBe(3);
  });
});

describe("§6.5 table — heat, memory, background", () => {
  it("light heat (fair): nothing visible, one thread fewer", () => {
    const r = run(new DevicePolicy(), signals({ thermal: "fair" }));
    expect(r).toMatchObject({ status: "normal", headline: null, threads: 3, pauseIndexing: false });
  });

  it("serious heat: line + 'Switch to Instant', half the threads, fewer GPU layers, 512 tokens, downloads paused", () => {
    const r = run(new DevicePolicy(), signals({ thermal: "serious" }));
    expect(r).toMatchObject({ status: "thermalSerious", recommendation: "act", action: "throttleThreads", targetTier: "instant", threads: 2, gpuLayers: 49, maxTokens: 512, pauseDownloads: true, pauseIndexing: true, headline: HEADLINE_KEYS.thermalSlowingPhone, button: "switchTo" });
    expect(r.buttonParams).toEqual({ model: "Instant" });
    const laptop = run(new DevicePolicy(), signals({ thermal: "serious", deviceClass: "laptop", currentTier: "sharp" }), defaultOverride("laptop"));
    expect(laptop).toMatchObject({ headline: HEADLINE_KEYS.thermalSlowingComputer, targetTier: "fast" });
    const desk = run(new DevicePolicy(), signals({ thermal: "serious", deviceClass: "desktop", currentTier: "power" }), defaultOverride("desktop"));
    expect(desk).toMatchObject({ status: "thermalSerious", threads: 2, headline: HEADLINE_KEYS.thermalSlowingComputer });
  });

  it("critical heat: the answer stops, weights go after 60 s, 'Continue' lights only when cool; cannot be turned off", () => {
    const p = new DevicePolicy({ recoveryHoldMs: 0 });
    const off: UserOverride = { autoPowerManagement: false, neverSwitchModel: true, profile: "max" };
    const r = run(p, signals({ thermal: "critical", generating: true }), off);
    expect(r).toMatchObject({ status: "thermalCritical", recommendation: "act", action: "pauseGeneration", stopGeneration: true, unloadAfterMs: 60_000, headline: HEADLINE_KEYS.thermalStoppedPhone, button: "continueWhenCool" });
    const cooled = run(p, signals({ thermal: "fair" }), off, 1);
    expect(cooled).toMatchObject({ status: "thermalCritical", button: "continue", action: "unloadModel" });
    expect(p.accept(2)).toEqual({ kind: "continue" });
    expect(run(p, signals({ thermal: "fair" }), off, 3).status).toBe("normal");
  });

  it("memory pressure on a phone: stop, unload now, Instant from the next message", () => {
    const p = new DevicePolicy();
    const r = run(p, signals({ memoryPressure: "warning", generating: true }));
    expect(r).toMatchObject({ status: "memory", recommendation: "act", action: "switchToSmaller", targetTier: "instant", stopGeneration: true, unloadAfterMs: 0, headline: HEADLINE_KEYS.memorySwitched, button: "switchBack" });
    p.noteSwitched("fast", "instant", true, "memory");
    expect(run(p, signals({ memoryPressure: "critical", currentTier: "instant" }), phone(), 1)).toMatchObject({ status: "memory", action: "unloadModel", headline: HEADLINE_KEYS.memorySwitched });
    /* Memory back to normal steps the line down after the hold; plugging in does not undo a memory switch (that promise belongs to the battery sheet). */
    expect(run(p, signals({ charging: true, currentTier: "instant" }), phone(), 60_000).status).toBe("memory");
    /* The line stays as a proposal so Switch back is reachable once memory is back, when it can succeed; Switch back clears it. */
    const back = run(p, signals({ charging: true, currentTier: "instant" }), phone(), 90_000);
    expect(back).toMatchObject({ status: "memoryBack", recommendation: "propose", action: "switchBack", targetTier: "fast", headline: HEADLINE_KEYS.memorySwitched, button: "switchBack", stopGeneration: false });
    expect(p.accept(91_000)).toEqual({ kind: "switch", tier: "fast" });
    expect(run(p, signals({ charging: true, currentTier: "fast" }), phone(), 92_000).status).toBe("normal");
  });

  /* QA F43: the boot-time RAM floor reads the model's minimum before anything is mapped; nothing ever ran out of memory. */
  it("the boot-time RAM floor says the model does not fit, not that memory ran out", () => {
    const p = new DevicePolicy();
    p.noteSwitched("fast", "instant", true, "fit");
    const r = run(p, signals({ currentTier: "instant" }), phone(), 1);
    expect(r).toMatchObject({ status: "memoryBack", recommendation: "propose", action: "switchBack", targetTier: "fast", headline: HEADLINE_KEYS.fitSwitched, button: "switchBack", stopGeneration: false });
    expect(r.headlineParams).toEqual({ model: "Fast", to: "Instant" });
    expect(r.buttonParams).toEqual({ model: "Fast" });
    expect(en[HEADLINE_KEYS.fitSwitched]).toBeTypeOf("string");
    expect(en[HEADLINE_KEYS.fitSwitched]).not.toMatch(/ran out/i);
    /* Switch back clears it, and a real eviction still gets the out-of-memory wording. */
    expect(p.accept(2)).toEqual({ kind: "switch", tier: "fast" });
    expect(run(p, signals({ currentTier: "fast" }), phone(), 3).status).toBe("normal");
    const q = new DevicePolicy();
    q.noteSwitched("fast", "instant", true, "memory");
    expect(run(q, signals({ currentTier: "instant" }), phone(), 1).headline).toBe(HEADLINE_KEYS.memorySwitched);
  });

  it("a fit switch is dismissable and does not come back on its own", () => {
    const p = new DevicePolicy();
    p.noteSwitched("fast", "instant", true, "fit");
    expect(run(p, signals({ currentTier: "instant" }), phone(), 1).status).toBe("memoryBack");
    p.dismiss();
    expect(run(p, signals({ currentTier: "instant" }), phone(), 2).status).toBe("normal");
  });

  it("memory line dismissed: hidden for as long as the switch stands, no automatic switch back", () => {
    const p = new DevicePolicy();
    run(p, signals({ memoryPressure: "critical" }));
    p.noteSwitched("fast", "instant", true, "memory");
    run(p, signals({ currentTier: "instant" }), phone(), 60_000);
    expect(run(p, signals({ currentTier: "instant" }), phone(), 90_000).status).toBe("memoryBack");
    p.dismiss();
    expect(run(p, signals({ currentTier: "instant" }), phone(), 91_000).status).toBe("normal");
    expect(run(p, signals({ memoryPressure: "critical", currentTier: "instant" }), phone(), 92_000).status).toBe("memory");
  });

  it("memory pressure with no Instant installed: stop and unload, the line says so, nothing is promised", () => {
    const r = run(new DevicePolicy(), signals({ memoryPressure: "warning", generating: true, availableTiers: ["fast"] }));
    expect(r).toMatchObject({ status: "memory", recommendation: "act", action: "unloadModel", targetTier: null, stopGeneration: true, unloadAfterMs: 0, headline: HEADLINE_KEYS.memoryStopped, button: null });
    /* Installed tiers keep the ordinary row; the battery proposal respects the same rule. */
    expect(run(new DevicePolicy(), signals({ memoryPressure: "warning", availableTiers: ["instant", "fast"] })).targetTier).toBe("instant");
    expect(run(new DevicePolicy(), signals({ battery: { level: 0.18, state: "unplugged", lowPowerMode: false }, availableTiers: ["fast"] })).status).toBe("normal");
    expect(run(new DevicePolicy(), signals({ battery: { level: 0.18, state: "unplugged", lowPowerMode: false }, availableTiers: ["instant", "fast"] })).status).toBe("batteryLow");
  });

  it("memory pressure elsewhere: proposal only", () => {
    const laptop = run(new DevicePolicy(), signals({ memoryPressure: "warning", deviceClass: "laptop", currentTier: "sharp" }), defaultOverride("laptop"));
    expect(laptop).toMatchObject({ status: "memory", recommendation: "propose", action: "suggestSmallerModel", targetTier: "fast", stopGeneration: false, unloadAfterMs: null, headline: HEADLINE_KEYS.memoryPropose, button: "switchSmaller" });
    const browser = run(new DevicePolicy(), signals({ memoryPressure: "warning", deviceClass: "browser", currentTier: "instant" }), defaultOverride("browser"));
    expect(browser).toMatchObject({ status: "memory", recommendation: "propose", button: null });
  });

  it("background mid-answer on a phone: 15 s to finish, then 'Paused · Continue'; computers keep going", () => {
    const p = new DevicePolicy();
    expect(run(p, signals({ generating: true, backgroundedForMs: 14_000 })).status).toBe("normal");
    const r = run(p, signals({ generating: true, backgroundedForMs: 15_000 }), phone(), 1);
    expect(r).toMatchObject({ status: "paused", action: "pauseGeneration", stopGeneration: true, headline: HEADLINE_KEYS.paused, button: "continue" });
    /* Back in the foreground the line waits for the user. */
    expect(run(p, signals({ generating: false, backgroundedForMs: null }), phone(), 2).status).toBe("paused");
    expect(p.accept(3)).toEqual({ kind: "continue" });
    expect(run(p, signals(), phone(), 4).status).toBe("normal");
    const laptop = run(new DevicePolicy(), signals({ deviceClass: "laptop", generating: true, backgroundedForMs: 60_000 }), defaultOverride("laptop"));
    expect(laptop.status).toBe("normal");
  });

  it("a pause the engine already made in the background shows 'Paused · Continue' on return", () => {
    const p = new DevicePolicy();
    expect(run(p, signals({ pausedInBackground: true }))).toMatchObject({ status: "paused", button: "continue" });
    expect(run(p, signals(), phone(), 1).status).toBe("paused");
    p.accept(2);
    expect(run(p, signals(), phone(), 3).status).toBe("normal");
    expect(run(new DevicePolicy(), signals({ deviceClass: "laptop", pausedInBackground: true }), defaultOverride("laptop")).status).toBe("normal");
  });
});

describe("§6.5 table — laptop, desktop, browser columns", () => {
  const laptop = (over: Parameters<typeof signals>[0] = {}) => signals({ deviceClass: "laptop", currentTier: "power", ...over });

  it("laptop on battery 20–10 %: proposal one step down", () => {
    const r = run(new DevicePolicy(), laptop({ level: 0.18 }), defaultOverride("laptop"));
    expect(r).toMatchObject({ status: "batteryLow", recommendation: "propose", targetTier: "sharp" });
    expect(r.headlineParams).toEqual({ level: 18, model: "Sharp" });
  });

  it("laptop Low Power: one step down, not Instant; Fast has nowhere to go", () => {
    expect(run(new DevicePolicy(), laptop({ lpm: true }), defaultOverride("laptop"))).toMatchObject({ status: "lowPower", action: "switchToSmaller", targetTier: "sharp" });
    expect(run(new DevicePolicy(), laptop({ lpm: true, currentTier: "fast" }), defaultOverride("laptop"))).toMatchObject({ status: "lowPower", action: "none", headline: HEADLINE_KEYS.lowPowerAlreadySmallest });
  });

  it("desktop on mains: no battery logic at all, heat only", () => {
    const desk = defaultOverride("desktop");
    expect(desk.autoPowerManagement).toBe(false);
    expect(run(new DevicePolicy(), signals({ deviceClass: "desktop", level: 0.03, lpm: true, currentTier: "power" }), desk).status).toBe("normal");
    expect(run(new DevicePolicy(), signals({ deviceClass: "desktop", thermal: "critical", currentTier: "power" }), desk).status).toBe("thermalCritical");
  });

  it("Windows throttling (35 % speed drop): proposal only, computers only", () => {
    const r = run(new DevicePolicy(), signals({ deviceClass: "desktop", throttling: true, currentTier: "power" }), defaultOverride("desktop"));
    expect(r).toMatchObject({ status: "throttling", recommendation: "propose", action: "suggestSmallerModel", targetTier: "sharp", headline: HEADLINE_KEYS.throttling, button: "switchSmaller" });
    expect(run(new DevicePolicy(), signals({ throttling: true })).status).toBe("normal");
  });

  it("browser: proposal below 15 % only, no automatic actions, no thermal", () => {
    const b = defaultOverride("browser");
    const p = new DevicePolicy();
    expect(run(p, signals({ deviceClass: "browser", level: 0.18, currentTier: "fast" }), b).status).toBe("normal");
    const r = run(p, signals({ deviceClass: "browser", level: 0.14, currentTier: "fast" }), b, 1);
    expect(r).toMatchObject({ status: "batteryLow", recommendation: "propose", headline: HEADLINE_KEYS.browserBattery, button: "switchSmaller", targetTier: "instant", maxTokens: 1024 });
    expect(run(new DevicePolicy(), signals({ deviceClass: "browser", level: 0.03, lpm: true, currentTier: "fast" }), b, 2).recommendation).toBe("propose");
    expect(run(new DevicePolicy(), signals({ deviceClass: "browser", level: null, currentTier: "fast" }), b).status).toBe("normal");
  });
});

describe("priority and hysteresis", () => {
  it("the most severe trigger owns the single status line", () => {
    const everything = signals({ level: 0.03, lpm: true, thermal: "critical", memoryPressure: "critical", throttling: true, generating: true, backgroundedForMs: 20_000 });
    const order: [Partial<DeviceSignals>, string][] = [
      [{}, "thermalCritical"],
      [{ thermal: "serious" }, "memory"],
      [{ thermal: "serious", memoryPressure: "normal" }, "paused"],
      [{ thermal: "serious", memoryPressure: "normal", backgroundedForMs: null }, "thermalSerious"],
      [{ thermal: "nominal", memoryPressure: "normal", backgroundedForMs: null }, "batteryCritical"],
      [{ thermal: "nominal", memoryPressure: "normal", backgroundedForMs: null, battery: { level: 0.08, state: "unplugged", lowPowerMode: false } }, "lowPower"],
      [{ thermal: "nominal", memoryPressure: "normal", backgroundedForMs: null, battery: { level: 0.18, state: "unplugged", lowPowerMode: false } }, "batteryLow"],
      [{ thermal: "nominal", memoryPressure: "normal", backgroundedForMs: null, battery: { level: 0.5, state: "unplugged", lowPowerMode: false }, deviceClass: "laptop", currentTier: "power" }, "throttling"],
    ];
    for (const [over, expected] of order) {
      expect(run(new DevicePolicy(), { ...everything, ...over }).status, expected).toBe(expected);
    }
  });

  it("18 % plus Battery Saver switching itself on: Low Power wins over the proposal", () => {
    expect(run(new DevicePolicy(), signals({ level: 0.18, lpm: true })).status).toBe("lowPower");
  });

  it("stepping down waits for the recovery hold; escalation is immediate", () => {
    const p = new DevicePolicy({ recoveryHoldMs: 20_000 });
    expect(run(p, signals({ thermal: "serious" }), phone(), 0).status).toBe("thermalSerious");
    expect(run(p, signals({ thermal: "nominal" }), phone(), 5_000).status).toBe("thermalSerious");
    expect(run(p, signals({ thermal: "nominal" }), phone(), 19_000).status).toBe("thermalSerious");
    expect(run(p, signals({ thermal: "nominal" }), phone(), 25_000).status).toBe("normal");
    expect(run(p, signals({ thermal: "serious" }), phone(), 25_001).status).toBe("thermalSerious");
  });

  it("battery thresholds carry 2 points of hysteresis", () => {
    const p = new DevicePolicy({ recoveryHoldMs: 0 });
    expect(run(p, signals({ level: 0.099 }), phone(), 0).status).toBe("lowPower");
    expect(run(p, signals({ level: 0.11 }), phone(), 1).status).toBe("lowPower");
    expect(run(p, signals({ level: 0.13 }), phone(), 2).status).toBe("batteryLow");
  });

  it("dismissing an action line hides it but keeps the protections", () => {
    const p = new DevicePolicy();
    run(p, signals({ level: 0.5, lpm: true, currentTier: "instant" }));
    p.dismiss();
    const r = run(p, signals({ level: 0.5, lpm: true, currentTier: "instant" }), phone(), 1);
    expect(r).toMatchObject({ status: "lowPower", headline: null, button: null, maxTokens: 512, pauseDownloads: true });
  });

  it("'Switch back' during Low Power is respected until the step is left", () => {
    const p = new DevicePolicy({ recoveryHoldMs: 0 });
    run(p, signals({ level: 0.5, lpm: true }));
    p.noteSwitched("fast", "instant", true);
    run(p, signals({ level: 0.5, lpm: true, currentTier: "instant" }), phone(), 1);
    expect(p.accept(2)).toEqual({ kind: "switch", tier: "fast" });
    expect(run(p, signals({ level: 0.5, lpm: true }), phone(), 3)).toMatchObject({ status: "lowPower", action: "none", headline: HEADLINE_KEYS.lowPowerAlreadySmallest, maxTokens: 512 });
    run(p, signals({ level: 0.5 }), phone(), 4);
    expect(run(p, signals({ level: 0.5, lpm: true }), phone(), 5).action).toBe("switchToSmaller");
  });

  it("context cap follows RAM: 2K under 6 GB", () => {
    expect(run(new DevicePolicy(), signals({ ramGB: 4 })).contextCap).toBe(2048);
    expect(run(new DevicePolicy(), signals({ ramGB: null })).contextCap).toBe(4096);
  });
});

describe("copy", () => {
  it("every headline and button key exists in en.json", () => {
    for (const key of Object.values(HEADLINE_KEYS)) expect(en[key], key).toBeTypeOf("string");
    for (const key of Object.values(BUTTON_KEYS)) expect(en[key], key).toBeTypeOf("string");
  });

  it("the lines read as the spec wrote them", () => {
    const line = (key: string, params: Record<string, string | number>) => en[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k]));
    expect(line(HEADLINE_KEYS.batteryPropose, { level: 18, model: "Instant" })).toBe("Battery 18% · Instant uses about half the power");
    expect(line(HEADLINE_KEYS.lowPowerSwitched, { model: "Instant" })).toBe("Low Power Mode · switched to Instant");
    expect(line(HEADLINE_KEYS.batteryCritical, { level: 4 })).toBe("Battery 4% · Answer anyway?");
    expect(line(HEADLINE_KEYS.chargingRestored, { model: "Fast" })).toBe("Charging · back to Fast");
    expect(line(BUTTON_KEYS.keep, { model: "Instant" })).toBe("Keep Instant");
    expect(line(BUTTON_KEYS.switchBackTo, { model: "Fast" })).toBe("Switch back to Fast");
    expect(en[HEADLINE_KEYS.lowPowerAlreadySmallest]).toBe("Low Power Mode · shorter answers, downloads paused");
    expect(en[HEADLINE_KEYS.thermalSlowingPhone]).toBe("Slowing down to keep the phone cool");
    expect(en[HEADLINE_KEYS.thermalStoppedPhone] + " · " + en[BUTTON_KEYS.continueWhenCool]).toBe("Stopped to protect the phone · Continue when cool");
    expect(en[HEADLINE_KEYS.throttling] + " · " + en[BUTTON_KEYS.switchSmaller]).toBe("Your PC is throttling · Switch to a smaller model");
    expect(line(HEADLINE_KEYS.memorySwitched, { model: "Instant" }) + " · " + en[BUTTON_KEYS.switchBack]).toBe("Ran out of memory · Switched to Instant · Switch back");
    expect(en[HEADLINE_KEYS.paused] + " · " + en[BUTTON_KEYS.continue]).toBe("Paused · Continue");
    expect(line(HEADLINE_KEYS.browserBattery, { level: 14 }) + " · " + en[BUTTON_KEYS.switchSmaller]).toBe("Battery 14% · Switch to a smaller model");
  });
});

describe("device classes", () => {
  it("defaults: auto power management on except desktop", () => {
    for (const c of ["phone", "tablet", "laptop", "browser"] as GuardDeviceClass[]) expect(defaultOverride(c).autoPowerManagement, c).toBe(true);
    expect(defaultOverride("desktop").autoPowerManagement).toBe(false);
  });
});
