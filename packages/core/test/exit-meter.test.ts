import { describe, expect, it } from "vitest";
import { accumulate, daysSince, emptyMeter, formatBytes, NetworkLog, networkAllowlist } from "../src/index";

describe("exit meter", () => {
  it("accumulates deltas of a boot-relative counter", () => {
    let s = emptyMeter(1000);
    s = accumulate(s, { tx: 0, rx: 100 });
    s = accumulate(s, { tx: 0, rx: 250 });
    expect(s.outBytes).toBe(0);
    expect(s.inBytes).toBe(250);
  });
  it("survives a reboot (counter restarts from zero)", () => {
    let s = emptyMeter(0);
    s = accumulate(s, { tx: 10, rx: 500 });
    s = accumulate(s, { tx: 3, rx: 40 });
    expect(s.outBytes).toBe(13);
    expect(s.inBytes).toBe(540);
  });
  it("returns the same state object when nothing moved", () => {
    const s = accumulate(emptyMeter(0), { tx: 5, rx: 5 });
    expect(accumulate(s, { tx: 5, rx: 5 })).toBe(s);
  });
  it("formats bytes the way the proof screen reads them", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-4)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(12.4 * 1024 * 1024)).toBe("12.4 MB");
    expect(formatBytes(2.71 * 1024 ** 3)).toBe("2.71 GB");
    expect(formatBytes(1.28 * 1024 ** 3)).toBe("1.28 GB");
  });
  it("counts whole days since install", () => {
    expect(daysSince(0, 41 * 86_400_000 + 5)).toBe(41);
    expect(daysSince(10, 5)).toBe(0);
  });
});

describe("network allowlist + log", () => {
  it("android has no host at all, iOS 26 only explicit HF, older iOS also the models host", () => {
    expect(networkAllowlist("android")).toEqual([]);
    expect(networkAllowlist("ios", 26).map((e) => e.host)).toEqual(["huggingface.co", "*.hf.co"]);
    expect(networkAllowlist("ios", 17).map((e) => e.host)).toEqual(["models.inbornapp.com", "huggingface.co", "*.hf.co"]);
    expect(networkAllowlist("web").every((e) => e.when === "explicit")).toBe(true);
  });
  it("totals the session log and notifies subscribers", () => {
    const log = new NetworkLog();
    let n = 0;
    const off = log.subscribe(() => n++);
    log.record({ host: "models.inbornapp.com", bytesOut: 300, bytesIn: 1_000_000, at: 1, purpose: "model" });
    log.record({ host: "models.inbornapp.com", bytesOut: 200, bytesIn: 5, at: 2, purpose: "model" });
    off();
    log.record({ host: "x", bytesOut: 1, bytesIn: 1, at: 3, purpose: "other" });
    expect(n).toBe(2);
    expect(log.totals()).toEqual({ out: 501, in: 1_000_006, connections: 3 });
  });
});
