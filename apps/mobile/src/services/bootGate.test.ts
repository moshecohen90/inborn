import { describe, expect, it, vi } from "vitest";
import { createBootGate } from "./bootGate";

describe("one boot per storage generation (F419)", () => {
  it("a provider mounted while the boot runs joins it instead of starting a second one", async () => {
    const gate = createBootGate<string>();
    const start = vi.fn(async () => "store-1");
    const [a, b] = await Promise.all([gate.run(start), gate.run(start)]);
    expect(start).toHaveBeenCalledOnce();
    expect(a).toBe(b);
  });

  it("after Delete everything the next boot opens the new database", async () => {
    const gate = createBootGate<number>();
    let n = 0;
    const start = async () => ++n;
    expect(await gate.run(start)).toBe(1);
    expect(await gate.run(start)).toBe(1);
    gate.next();
    const [a, b] = await Promise.all([gate.run(start), gate.run(start)]);
    expect([a, b]).toEqual([2, 2]);
  });

  it("a boot that failed is tried again by the next mount", async () => {
    const gate = createBootGate<string>();
    await expect(gate.run(async () => Promise.reject(new Error("keychain locked")))).rejects.toThrow("keychain locked");
    await Promise.resolve();
    expect(await gate.run(async () => "store")).toBe("store");
  });
});
