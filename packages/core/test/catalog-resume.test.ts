import { describe, expect, it } from "vitest";
import { acceptsResume, backoffMs, checkSpace, formatModelBytes, resumePlan, shouldWait } from "../src/index";

const GB = 1024 ** 3;
const url = "https://models.inbornapp.com/v1/Qwen3.5-2B-Q4_K_M.gguf";

describe("resumePlan (spec §5.4, §10.1 #2)", () => {
  it("a fresh download starts at zero with no Range header", () => {
    expect(resumePlan(null, { total: 100, acceptRanges: true })).toEqual({ action: "resume", start: 0, headers: {} });
    expect(resumePlan({ url, bytes: 0 }, { total: 100, acceptRanges: true })).toEqual({ action: "resume", start: 0, headers: {} });
  });
  it("continues from the bytes on disk with Range + If-Range when the server supports it", () => {
    expect(resumePlan({ url, bytes: 40, etag: '"abc"', total: 100 }, { total: 100, etag: '"abc"', acceptRanges: true })).toEqual({
      action: "resume",
      start: 40,
      headers: { Range: "bytes=40-", "If-Range": '"abc"' },
    });
  });
  it("restarts when the file changed, the size differs, the partial overran, or ranges are unsupported", () => {
    expect(resumePlan({ url, bytes: 40, etag: '"old"' }, { total: 100, etag: '"new"', acceptRanges: true })).toEqual({ action: "restart", reason: "changed" });
    expect(resumePlan({ url, bytes: 40, total: 90 }, { total: 100, acceptRanges: true })).toEqual({ action: "restart", reason: "size-mismatch" });
    expect(resumePlan({ url, bytes: 140 }, { total: 100, acceptRanges: true })).toEqual({ action: "restart", reason: "overrun" });
    expect(resumePlan({ url, bytes: 40 }, { total: 100, acceptRanges: false })).toEqual({ action: "restart", reason: "no-ranges" });
  });
  it("a complete partial file is done (the hash check decides after that)", () => {
    expect(resumePlan({ url, bytes: 100 }, { total: 100, acceptRanges: true })).toEqual({ action: "done" });
  });
  it("acceptsResume trusts only a 206 whose Content-Range starts exactly at the file length", () => {
    expect(acceptsResume(206, "bytes 40-99/100", 40)).toBe(true);
    expect(acceptsResume(206, "bytes 0-99/100", 40)).toBe(false);
    expect(acceptsResume(200, null, 40)).toBe(false);
    expect(acceptsResume(200, null, 0)).toBe(true);
    expect(acceptsResume(206, null, 40)).toBe(false);
  });
});

describe("space, network and backoff (spec §10.1 #4/#5/#6)", () => {
  it("checkSpace reports how far short the disk is", () => {
    expect(checkSpace(3 * GB, 5 * GB)).toEqual({ ok: true, requiredBytes: 3 * GB, shortByBytes: 0 });
    expect(checkSpace(3 * GB, 1 * GB)).toEqual({ ok: false, requiredBytes: 3 * GB, shortByBytes: 2 * GB });
  });
  it("cellular waits above 100 MB by default, never below it, and no network always waits", () => {
    expect(shouldWait(50 * 1024 ** 2, "cellular", true)).toBe(false);
    expect(shouldWait(1.3 * GB, "cellular", true)).toBe(true);
    expect(shouldWait(1.3 * GB, "cellular", false)).toBe(false);
    expect(shouldWait(1.3 * GB, "wifi", true)).toBe(false);
    expect(shouldWait(1, "none", false)).toBe(true);
  });
  it("backoff doubles from 2 s and caps at 60 s", () => {
    expect([0, 1, 2, 3, 10].map(backoffMs)).toEqual([2000, 4000, 8000, 16000, 60000]);
  });
  it("formatModelBytes matches the cartridge copy", () => {
    expect(formatModelBytes(532517120)).toBe("508 MB");
    expect(formatModelBytes(1280835840)).toBe("1.2 GB");
    expect(formatModelBytes(2740937888)).toBe("2.6 GB");
    expect(formatModelBytes(12 * GB)).toBe("12 GB");
  });
});
