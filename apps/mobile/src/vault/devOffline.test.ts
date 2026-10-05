import { beforeEach, describe, expect, it, vi } from "vitest";
import { isDevBuild } from "../licence/buildKind";

const build = { dev: false };
vi.mock("../licence/devFlags", () => ({ devBuild: () => build.dev }));
vi.mock("expo-network", () => ({ getNetworkStateAsync: async () => ({ type: "WIFI", isConnected: true }), addNetworkStateListener: () => ({ remove: () => undefined }) }));

const { onSimulatedOffline, setSimulatedOffline, simulatedOffline } = await import("./devOffline");
const { networkKind, onNetworkChange } = await import("./network");

beforeEach(() => {
  build.dev = true;
  setSimulatedOffline(false);
});

describe("the QA offline switch (round 130)", () => {
  it("a store bundle cannot turn it on: the switch refuses and the network stays what the phone says", async () => {
    build.dev = false;
    expect(setSimulatedOffline(true)).toBe(false);
    expect(simulatedOffline()).toBe(false);
    expect(await networkKind()).toBe("wifi");
  });

  it("a store bundle is never a dev build, whatever its environment carried", () => {
    expect(isDevBuild({ devBundle: false, devVariant: false, devModelHost: true, testPurchaseFlag: true })).toBe(false);
  });

  it("a dev or QA build reads no network while it is on, and the phone's again once it is off", async () => {
    expect(setSimulatedOffline(true)).toBe(true);
    expect(await networkKind()).toBe("none");
    setSimulatedOffline(false);
    expect(await networkKind()).toBe("wifi");
  });

  it("tells the listeners each flip, once", async () => {
    const seen: boolean[] = [];
    const stop = onSimulatedOffline((on) => seen.push(on));
    setSimulatedOffline(true);
    setSimulatedOffline(true);
    setSimulatedOffline(false);
    stop();
    expect(seen).toEqual([true, false]);
  });

  it("a network listener hears the flip as a path change", async () => {
    const kinds: string[] = [];
    const stop = onNetworkChange((k) => kinds.push(k));
    setSimulatedOffline(true);
    await new Promise((r) => setTimeout(r, 0));
    setSimulatedOffline(false);
    await new Promise((r) => setTimeout(r, 0));
    stop();
    expect(kinds).toEqual(["none", "wifi"]);
  });
});
