import { describe, expect, it, vi } from "vitest";
import { needsSweep, runScript, sweepWhenAcked, type NodeValue, type Step, type Surface } from "./steps";

/** A Surface with no device behind it: the tree is a map, time is a counter, sleeping is free. */
function fake(nodes: Record<string, NodeValue> = {}) {
  let clock = 0;
  const calls: string[] = [];
  const probes: { bytes: number; ms: number; complete: boolean }[] = [];
  const surface: Surface = {
    press: (testID) => {
      if (!nodes[testID]) throw new Error(`press ${testID}: not mounted`);
      calls.push(`press:${testID}`);
      return `${testID} ← onPress`;
    },
    type: (testID, text) => {
      const node = nodes[testID];
      if (!node) throw new Error(`type ${testID}: no field with that testID takes text`);
      node.props.value = text;
      calls.push(`type:${testID}`);
    },
    read: (testID) => nodes[testID] ?? null,
    screenText: () => Object.values(nodes).map((n) => n.text).join(" "),
    dump: () => Object.entries(nodes).map(([testID, n]) => ({ testID, text: n.text })),
    scrollTo: async (testID) => {
      calls.push(`scrollTo:${testID}`);
    },
    deeplink: (url) => calls.push(`deeplink:${url}`),
    setTier: async (tier) => {
      calls.push(`setTier:${tier}`);
    },
    screenshot: async (name) => {
      calls.push(`shot:${name}`);
    },
    devPrompt: (lines) => calls.push(`devPrompt:${lines.join("|")}`),
    cleanup: () => calls.push("cleanup"),
    probeDownload: async (url, session, seconds) => {
      calls.push(`probe:${session}:${seconds}:${url}`);
      return probes.shift() ?? { bytes: 0, ms: 0, complete: false };
    },
    idleTimerDisabled: async () => idle.disabled,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
  return { surface, calls, nodes, probes, advance: (ms: number) => (clock += ms) };
}

const node = (text: string, props: Record<string, unknown> = {}): NodeValue => ({ text, props });
const run = (surface: Surface, steps: Step[]) => runScript(surface, "t", steps);

describe("runScript", () => {
  it("runs every verb of the vocabulary and reports each one", async () => {
    const { surface, calls, nodes } = fake({ "composer-input": node("", { value: "" }), send: node(""), "assistant-text": node("Arendal ferry lines") });
    const result = await run(surface, [
      { op: "type", testID: "composer-input", text: "hello" },
      { op: "send" },
      { op: "waitFor", testID: "assistant-text", timeoutMs: 1000 },
      { op: "assertText", text: "ARENDAL" },
      { op: "value", testID: "assistant-text" },
      { op: "dump" },
      { op: "screenshot", name: "F01" },
      { op: "scrollTo", testID: "send" },
      { op: "deeplink", url: "inborn:///vault" },
      { op: "setTier", tier: "pro" },
      { op: "devPrompt", lines: ["image: door.jpg"] },
      { op: "sleep", ms: 10 },
      { op: "cleanup" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.failed).toBe(0);
    expect(result.steps).toHaveLength(13);
    expect(calls).toContain("devPrompt:image: door.jpg");
    expect(nodes["composer-input"]?.props.value).toBe("hello");
    expect(calls).toContain("shot:F01");
    expect(calls).toContain("setTier:pro");
    expect(result.steps[4]?.value?.text).toBe("Arendal ferry lines");
    expect(result.steps[5]?.nodes).toHaveLength(3);
  });

  it("keeps going after a red step and counts both sides", async () => {
    const { surface } = fake({ send: node("") });
    const result = await run(surface, [{ op: "press", testID: "ghost" }, { op: "press", testID: "send" }]);
    expect(result.ok).toBe(false);
    expect([result.passed, result.failed]).toEqual([1, 1]);
    expect(result.steps[0]?.detail).toContain("not mounted");
    expect(result.errors[0]).toContain("step 0 (press)");
  });

  it("fails a waitFor that never comes true, at the timeout it was given", async () => {
    const { surface } = fake({});
    const result = await run(surface, [{ op: "waitFor", testID: "assistant-text", timeoutMs: 800 }]);
    expect(result.steps[0]?.ok).toBe(false);
    expect(result.steps[0]?.detail).toContain("never appeared");
    expect(result.steps[0]?.ms).toBeGreaterThanOrEqual(800);
  });

  it("waits for something to go away too", async () => {
    const { surface, nodes } = fake({ toast: node("Nothing in your documents matched") });
    const gone = run(surface, [{ op: "waitFor", testID: "toast", gone: true, timeoutMs: 5000 }]);
    delete nodes.toast;
    expect((await gone).ok).toBe(true);
  });

  it("assertText reads the whole screen, or one node, and honours `absent`", async () => {
    const { surface } = fake({ citations: node(""), "assistant-text": node("No sources were used") });
    const result = await run(surface, [
      { op: "assertText", text: "no sources", testID: "assistant-text" },
      { op: "assertText", text: "SOURCES", testID: "citations", absent: true },
      { op: "assertText", text: "never rendered" },
      { op: "assertText", text: "no sources", testID: "assistant-text", absent: true },
    ]);
    expect(result.steps.map((s) => s.ok)).toEqual([true, true, false, false]);
    expect(result.steps[3]?.detail).toContain("should not be");
  });

  it("fails `value` on an id that is not mounted rather than reporting an empty string", async () => {
    const { surface } = fake({});
    const result = await run(surface, [{ op: "value", testID: "paywall-title" }]);
    expect(result.steps[0]).toMatchObject({ ok: false });
    expect(result.steps[0]?.detail).toContain("no node with that testID is mounted");
  });

  it("fails a type whose field did not take the text", async () => {
    const stubborn = fake({ locked: node("", { value: "" }) });
    stubborn.surface.type = () => undefined;
    const result = await run(stubborn.surface, [{ op: "type", testID: "locked", text: "hello" }]);
    expect(result.steps[0]?.ok).toBe(false);
    expect(result.steps[0]?.detail).toContain("field holds");
  });

  it("surfaces a screenshot the driver never acknowledged", async () => {
    const { surface } = fake({});
    surface.screenshot = vi.fn(async () => {
      throw new Error("screenshot F01: the driver never acknowledged in 120 s");
    });
    const result = await run(surface, [{ op: "screenshot", name: "F01" }]);
    expect(result.steps[0]?.ok).toBe(false);
    expect(result.steps[0]?.detail).toContain("never acknowledged");
  });
});

/**
 * A script that ends in `cleanup` still leaves its own report behind, because the report is written after the last
 * step. This is the second sweep that takes it away — and the rule that it never deletes a report nobody read.
 */
describe("the second sweep", () => {
  it("only applies to a script that asked to clean up", () => {
    expect(needsSweep([{ op: "press", testID: "send" }])).toBe(false);
    expect(needsSweep([{ op: "press", testID: "send" }, { op: "cleanup" }])).toBe(true);
    expect(needsSweep([])).toBe(false);
  });

  it("deletes the namespace once the driver acknowledges the report", async () => {
    let clock = 0;
    let acks = 0;
    let deleted = false;
    const swept = await sweepWhenAcked(
      { acked: () => ++acks > 3, cleanup: () => (deleted = true), sleep: async (ms) => void (clock += ms), now: () => clock },
      120000,
    );
    expect([swept, deleted]).toEqual([true, true]);
    expect(clock).toBe(1500);
  });

  it("gives up rather than deleting a report nobody read", async () => {
    let clock = 0;
    let deleted = false;
    const swept = await sweepWhenAcked(
      { acked: () => false, cleanup: () => (deleted = true), sleep: async (ms) => void (clock += ms), now: () => clock },
      2000,
    );
    expect([swept, deleted]).toEqual([false, false]);
    expect(clock).toBeGreaterThanOrEqual(2000);
  });
});

describe("probeDownload (F370: the phone moved 205 MB at 0.09 MB/s through the background session)", () => {
  const url = "https://models.inbornapp.com/v1/mmproj-Qwen3.5-0.8B-F16.gguf";

  it("measures one session type and reports MB/s, bytes and time", async () => {
    const { surface, calls, probes } = fake();
    probes.push({ bytes: 50_000_000, ms: 5_000, complete: false }, { bytes: 204_987_232, ms: 5_125, complete: true });
    const result = await run(surface, [
      { op: "probeDownload", url, session: "background", seconds: 5 },
      { op: "probeDownload", url, session: "foreground" },
    ]);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([`probe:background:5:${url}`, `probe:foreground:20:${url}`]);
    expect(result.steps[0]?.detail).toBe("background 10.00 MB/s · 50000000 B in 5000 ms");
    expect(result.steps[0]?.value?.props).toMatchObject({ session: "background", bytes: 50_000_000, ms: 5_000, mbps: 10, complete: false });
    expect(result.steps[1]?.detail).toBe("foreground 40.00 MB/s · 204987232 B in 5125 ms · complete");
  });

  it("is red when nothing moved, so a dead network never reads as 0 MB/s passed", async () => {
    const { surface, probes } = fake();
    probes.push({ bytes: 0, ms: 20_000, complete: false });
    const result = await run(surface, [{ op: "probeDownload", url, session: "background" }]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/background moved no bytes in 20000 ms/);
  });

  it("refuses an unknown session type or a window outside 1..600 s without touching the network", async () => {
    const { surface, calls } = fake();
    const result = await run(surface, [
      { op: "probeDownload", url, session: "discretionary" as never },
      { op: "probeDownload", url, session: "foreground", seconds: 0 },
      { op: "probeDownload", url, session: "foreground", seconds: 601 },
    ]);
    expect(result.failed).toBe(3);
    expect(calls).toEqual([]);
  });
});

const idle = { disabled: false };

describe("idleTimer (round 91: the screen stays awake while a model downloads)", () => {
  it("reports the flag and fails when it is not what the script expects", async () => {
    const { surface } = fake();
    idle.disabled = true;
    const on = await run(surface, [{ op: "idleTimer", disabled: true }]);
    expect(on.steps[0]).toMatchObject({ ok: true, detail: "idle timer disabled: true" });
    idle.disabled = false;
    const off = await run(surface, [{ op: "idleTimer", disabled: true }]);
    expect(off.steps[0]?.ok).toBe(false);
  });
});
