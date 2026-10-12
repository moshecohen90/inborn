import { describe, expect, it, vi } from "vitest";

/* fileHandler pulls react-native for Linking; the redirect itself never touches it. */
vi.mock("react-native", () => ({ Linking: { getInitialURL: async () => null, addEventListener: () => ({ remove: () => undefined }) } }));

const { redirectSystemPath } = await import("../src/app/+native-intent");

describe("redirectSystemPath · a model file opened with Inborn is not a route", () => {
  it("keeps the screen that is up when the app is warm, and lands on the first screen on a cold start", () => {
    const media = "content://media/external/downloads/1000050223";
    expect(redirectSystemPath({ path: media, initial: false })).toBeNull();
    expect(redirectSystemPath({ path: media, initial: true })).toBe("/");
    expect(redirectSystemPath({ path: "file:///storage/emulated/0/Download/Qwen3.5-0.8B-Q4_K_M.gguf", initial: false })).toBeNull();
  });

  it("leaves the app's own links alone", () => {
    expect(redirectSystemPath({ path: "inborn://vault", initial: false })).toBe("inborn://vault");
    expect(redirectSystemPath({ path: "/settings", initial: true })).toBe("/settings");
  });
});
