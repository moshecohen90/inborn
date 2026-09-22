import { describe, expect, it, vi } from "vitest";

vi.mock("expo-network", () => ({ getNetworkStateAsync: async () => ({ type: "WIFI", isConnected: true }) }));

const { kindOf } = await import("./network");

describe("network kind for the Wi-Fi-only rule (§10.1 #4)", () => {
  it("names the paths expo-network reports", () => {
    expect(kindOf("WIFI", true)).toBe("wifi");
    expect(kindOf("ETHERNET", true)).toBe("ethernet");
    expect(kindOf("CELLULAR", true)).toBe("cellular");
    expect(kindOf("NONE", undefined)).toBe("none");
  });

  it("a disconnected path is none whatever the type says", () => {
    expect(kindOf("WIFI", false)).toBe("none");
    expect(kindOf("CELLULAR", false)).toBe("none");
  });

  it("anything it will not name is unknown, which the rule treats like a data plan", () => {
    for (const t of ["VPN", "BLUETOOTH", "WIMAX", "OTHER", "", undefined]) expect(kindOf(t, true)).toBe("unknown");
  });
});
