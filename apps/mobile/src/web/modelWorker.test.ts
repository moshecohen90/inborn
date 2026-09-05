import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
// The shipped worker itself (apps/mobile/public/model-worker.js), not a copy of it.
import { createSha256, planResponse } from "../../public/model-worker.js";

const nodeSha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("createSha256", () => {
  it("matches the known vectors", () => {
    const h = createSha256();
    expect(h.hex()).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    h.update(new TextEncoder().encode("abc"));
    expect(h.hex()).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("hashes across arbitrary chunk boundaries like node", () => {
    const data = randomBytes(1_000_003);
    const h = createSha256();
    for (let i = 0, step = 1; i < data.length; i += step, step = (step * 7 + 3) % 5000 || 1) h.update(data.subarray(i, i + step));
    expect(h.hex()).toBe(nodeSha(data));
  });
  it("exports and restores its midstate, so a resumed download keeps hashing", () => {
    const data = randomBytes(300_001);
    const first = createSha256();
    first.update(data.subarray(0, 123_457));
    const state = JSON.parse(JSON.stringify(first.exportState()));
    const second = createSha256();
    second.importState(state);
    second.update(data.subarray(123_457));
    expect(second.hex()).toBe(nodeSha(data));
  });
  it("hex() does not disturb further updates", () => {
    const data = randomBytes(70_000);
    const h = createSha256();
    h.update(data.subarray(0, 100));
    h.hex();
    h.update(data.subarray(100));
    expect(h.hex()).toBe(nodeSha(data));
  });
});

describe("planResponse", () => {
  it("continues on a matching 206", () => {
    expect(planResponse(1000, 206, "bytes 1000-4999/5000", "4000")).toEqual({ restart: false, total: 5000 });
    expect(planResponse(1000, 206, "bytes 1000-4999/*", "4000")).toEqual({ restart: false, total: 5000 });
  });
  it("restarts when the server ignores the range or answers a different offset", () => {
    expect(planResponse(1000, 200, null, "5000")).toEqual({ restart: true, total: 5000 });
    expect(planResponse(1000, 206, "bytes 0-4999/5000", "5000")).toEqual({ restart: true, total: null });
    expect(planResponse(0, 200, null, null)).toEqual({ restart: false, total: null });
  });
  it("throws on anything else", () => {
    expect(() => planResponse(0, 404, null, null)).toThrow(/HTTP 404/);
    expect(() => planResponse(10, 416, null, null)).toThrow(/HTTP 416/);
  });
});
