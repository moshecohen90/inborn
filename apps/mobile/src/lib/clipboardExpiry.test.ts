import { describe, expect, it } from "vitest";
import { ExpiringClipboard, type ExpiryTimers, type Pasteboard } from "./clipboardExpiry";

/** A pasteboard whose content is visible to the test, plus a controllable clock. */
function harness(options: { readable?: boolean } = {}) {
  const readable = options.readable ?? true;
  let content: string | null = null;
  const calls: string[] = [];
  const pasteboard: Pasteboard = {
    write: async (t) => {
      calls.push(`write:${t}`);
      content = t;
    },
    read: async () => {
      calls.push("read");
      return readable ? content : null;
    },
    clear: async () => {
      calls.push("clear");
      content = "";
    },
  };
  let next = 1;
  const scheduled = new Map<number, { fn: () => void; ms: number }>();
  const timers: ExpiryTimers = {
    set: (fn, ms) => {
      const h = next++;
      scheduled.set(h, { fn, ms });
      return h;
    },
    clear: (h) => {
      scheduled.delete(h as number);
    },
  };
  return {
    clipboard: new ExpiringClipboard(pasteboard, timers),
    calls,
    get content() {
      return content;
    },
    setContent(v: string) {
      content = v;
    },
    get pending() {
      return [...scheduled.values()];
    },
    async fireAll() {
      const due = [...scheduled.entries()];
      scheduled.clear();
      for (const [, t] of due) t.fn();
    },
  };
}

describe("clipboard expiry (§7.5 Security setting, §10.6 case 58)", () => {
  it("off: copies and schedules nothing", async () => {
    const h = harness();
    await h.clipboard.copy("secret");
    expect(h.content).toBe("secret");
    expect(h.pending).toHaveLength(0);
    expect(h.clipboard.pendingText).toBeNull();
  });

  it("60 s: clears the pasteboard once the timer fires, and asks for exactly 60 s", async () => {
    const h = harness();
    h.clipboard.setExpiry(60);
    await h.clipboard.copy("secret");
    expect(h.pending.map((t) => t.ms)).toEqual([60_000]);
    expect(h.content).toBe("secret");
    await h.fireAll();
    await h.clipboard.settled();
    expect(h.content).toBe("");
    expect(h.calls).toEqual(["write:secret", "read", "clear"]);
  });

  it("leaves the pasteboard alone when it no longer holds what we copied", async () => {
    const h = harness();
    h.clipboard.setExpiry(60);
    await h.clipboard.copy("secret");
    h.setContent("a shopping list the user copied afterwards");
    await h.fireAll();
    await h.clipboard.settled();
    expect(h.content).toBe("a shopping list the user copied afterwards");
    expect(h.calls).not.toContain("clear");
  });

  it("leaves the pasteboard alone when the platform will not let us read it back", async () => {
    const h = harness({ readable: false });
    h.clipboard.setExpiry(60);
    await h.clipboard.copy("secret");
    await h.fireAll();
    await h.clipboard.settled();
    expect(h.content).toBe("secret");
    expect(h.calls).not.toContain("clear");
  });

  it("a second copy replaces the first timer, so only the newest text is on the clock", async () => {
    const h = harness();
    h.clipboard.setExpiry(60);
    await h.clipboard.copy("first");
    await h.clipboard.copy("second");
    expect(h.pending).toHaveLength(1);
    expect(h.clipboard.pendingText).toBe("second");
    await h.fireAll();
    await h.clipboard.settled();
    expect(h.content).toBe("");
  });

  it("switching the setting to Off releases a copy that is already waiting", async () => {
    const h = harness();
    h.clipboard.setExpiry(60);
    await h.clipboard.copy("secret");
    h.clipboard.setExpiry(0);
    expect(h.pending).toHaveLength(0);
    expect(h.clipboard.pendingText).toBeNull();
    await h.fireAll();
    await h.clipboard.settled();
    expect(h.content).toBe("secret");
  });

  it("ignores a nonsense expiry rather than scheduling an immediate wipe", async () => {
    const h = harness();
    h.clipboard.setExpiry(Number.NaN);
    expect(h.clipboard.expirySeconds).toBe(0);
    h.clipboard.setExpiry(-5);
    expect(h.clipboard.expirySeconds).toBe(0);
    await h.clipboard.copy("secret");
    expect(h.pending).toHaveLength(0);
  });

  it("survives a pasteboard that throws on read", async () => {
    const throwing: Pasteboard = { write: async () => undefined, read: async () => { throw new Error("denied"); }, clear: async () => { throw new Error("denied"); } };
    const clipboard = new ExpiringClipboard(throwing, { set: (fn) => { fn(); return 1; }, clear: () => undefined });
    clipboard.setExpiry(60);
    await clipboard.copy("secret");
    await expect(clipboard.settled()).resolves.toBeUndefined();
  });
});
