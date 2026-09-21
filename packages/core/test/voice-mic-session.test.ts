import { describe, expect, it } from "vitest";
import { micShouldStart, micShouldStop, nextMicState, serialQueue, type MicSessionState } from "../src/index";

const drive = (events: Parameters<typeof nextMicState>[1][]): MicSessionState => events.reduce<MicSessionState>((s, e) => nextMicState(s, e), "idle");

describe("mic session state machine (QA F35)", () => {
  it("runs one session at a time", () => {
    expect(drive(["start"])).toBe("starting");
    expect(drive(["start", "started"])).toBe("running");
    expect(drive(["start", "started", "stop"])).toBe("stopping");
    expect(drive(["start", "started", "stop", "stopped"])).toBe("idle");
  });

  it("never starts a second recorder over a live or closing one", () => {
    expect(micShouldStart("idle")).toBe(true);
    for (const s of ["starting", "running", "stopping"] as const) expect(micShouldStart(s), s).toBe(false);
    expect(drive(["start", "started", "start"])).toBe("running");
    /* A start while the native side is still tearing down is the crash: the queue holds it, the state refuses it. */
    expect(drive(["start", "started", "stop", "start"])).toBe("stopping");
  });

  it("only stops something that is up", () => {
    expect(micShouldStop("running")).toBe(true);
    expect(micShouldStop("starting")).toBe(true);
    expect(micShouldStop("idle")).toBe(false);
    expect(micShouldStop("stopping")).toBe(false);
    expect(drive(["stop"])).toBe("idle");
    expect(drive(["start", "started", "stop", "stop"])).toBe("stopping");
  });

  it("a failed start leaves nothing running", () => {
    expect(drive(["start", "failed"])).toBe("idle");
    expect(micShouldStart(drive(["start", "failed"]))).toBe(true);
  });
});

describe("serialQueue", () => {
  it("never overlaps two tasks and keeps call order", async () => {
    const queue = serialQueue();
    const log: string[] = [];
    let live = 0;
    const task = (name: string, ms: number) => async () => {
      live++;
      expect(live, name).toBe(1);
      log.push(`+${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`-${name}`);
      live--;
      return name;
    };
    const all = await Promise.all([queue(task("a", 20)), queue(task("b", 1)), queue(task("c", 5))]);
    expect(all).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["+a", "-a", "+b", "-b", "+c", "-c"]);
  });

  it("a rejection reaches its own caller and does not stall the queue", async () => {
    const queue = serialQueue();
    const failed = queue(() => Promise.reject(new Error("boom")));
    const after = queue(() => Promise.resolve("ok"));
    await expect(failed).rejects.toThrow("boom");
    await expect(after).resolves.toBe("ok");
  });
});
