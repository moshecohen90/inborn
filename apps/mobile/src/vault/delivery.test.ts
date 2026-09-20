import { describe, expect, it } from "vitest";
import { isPlayUnavailable } from "./delivery";

describe("isPlayUnavailable (QA F26)", () => {
  it("recognizes every way Play says it cannot serve this build", () => {
    /* What a sideloaded APK actually throws from AssetPackManager.fetch (seen on Pixel_6_API_33). */
    expect(isPlayUnavailable("Failed to bind to the service.")).toBe(true);
    expect(isPlayUnavailable("play-unavailable")).toBe(true);
    expect(isPlayUnavailable("Play Store service is not connected")).toBe(true);
    expect(isPlayUnavailable("API not available")).toBe(true);
  });
  it("leaves a real download failure retryable", () => {
    expect(isPlayUnavailable("network")).toBe(false);
    expect(isPlayUnavailable("insufficient-storage")).toBe(false);
    expect(isPlayUnavailable("pack inborn_model completed but Qwen3.5-0.8B-Q4_K_M.gguf is missing")).toBe(false);
    expect(isPlayUnavailable("canceled")).toBe(false);
  });
});
