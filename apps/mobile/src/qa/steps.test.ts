import { describe, expect, it, vi } from "vitest";
import { runScript, type NodeValue, type Step, type Surface } from "./steps";

/** A Surface with no device behind it: the tree is a map, time is a counter, sleeping is free. */
function fake(nodes: Record<string, NodeValue> = {}) {
  let clock = 0;
  const calls: string[] = [];
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
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
  return { surface, calls, nodes, advance: (ms: number) => (clock += ms) };
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
