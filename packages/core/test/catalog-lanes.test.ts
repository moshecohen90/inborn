import { describe, expect, it } from "vitest";
import { DeliveryLanes, LARGE_DELIVERY_BYTES } from "../src/catalog";

const settled = async (p: Promise<void>): Promise<boolean> => {
  let done = false;
  void p.then(() => (done = true));
  await Promise.resolve();
  await Promise.resolve();
  return done;
};

describe("DeliveryLanes", () => {
  it("a small companion starts while a large model is streaming", async () => {
    const lanes = new DeliveryLanes();
    await lanes.acquire("sharp", 2_740_938_080);
    expect(await settled(lanes.acquire("whisper", 147_951_465))).toBe(true);
    expect(await settled(lanes.acquire("embed", 274_290_560))).toBe(true);
    expect(lanes.isRunning("whisper")).toBe(true);
  });

  it("a second large model waits for the first, and never blocks the small lane", async () => {
    const lanes = new DeliveryLanes();
    await lanes.acquire("sharp", 2_740_938_080);
    const phi = lanes.acquire("sharp-phi", 2_491_874_272);
    expect(await settled(phi)).toBe(false);
    expect(lanes.isWaiting("sharp-phi")).toBe(true);
    expect(await settled(lanes.acquire("vision", 204_987_232))).toBe(true);
    lanes.release("sharp");
    expect(await settled(phi)).toBe(true);
    expect(lanes.isRunning("sharp-phi")).toBe(true);
  });

  it("queued deliveries start smallest first within their lane", async () => {
    const lanes = new DeliveryLanes(1, 1);
    await lanes.acquire("a", 100);
    const big = lanes.acquire("big", 900);
    const small = lanes.acquire("small", 200);
    lanes.release("a");
    expect(await settled(small)).toBe(true);
    expect(await settled(big)).toBe(false);
    lanes.release("small");
    expect(await settled(big)).toBe(true);
  });

  it("releasing a waiting id drops it from the queue and wakes it; the threshold is 1 GB", async () => {
    const lanes = new DeliveryLanes(1, 1);
    void lanes.acquire("a", 100);
    const b = lanes.acquire("b", 100);
    lanes.release("b");
    expect(lanes.isWaiting("b")).toBe(false);
    expect(await settled(b)).toBe(true);
    expect(lanes.isRunning("b")).toBe(false);
    expect(DeliveryLanes.isLarge(LARGE_DELIVERY_BYTES)).toBe(true);
    expect(DeliveryLanes.isLarge(LARGE_DELIVERY_BYTES - 1)).toBe(false);
  });
});
