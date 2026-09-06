import { describe, expect, it } from "vitest";
import { bundledWeight, contrastRatio, dark, fontFace, fonts, light, scaledStep, typeScale, TEXT_SCALES, MAX_TEXT_SCALE } from "./tokens";

describe("contrast (QA B11)", () => {
  it("text, text2 and text3 reach 4.5:1 on every surface in both schemes", () => {
    for (const theme of [dark, light])
      for (const surface of [theme.bg, theme.surface1, theme.surface2, theme.well])
        for (const ink of [theme.text, theme.text2, theme.text3]) expect(contrastRatio(ink, surface), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });
  it("cta text reaches 4.5:1 on the cta fill", () => {
    expect(contrastRatio(dark.ctaText, dark.ctaFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.ctaText, light.ctaFill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("fontFace", () => {
  it("gives the web a stack that never ends in a serif", () => {
    expect(fontFace("sans", "600", "web")).toEqual({ fontFamily: fonts.sans, fontWeight: "600" });
    expect(fonts.sans.endsWith("sans-serif")).toBe(true);
    expect(fonts.mono.endsWith("monospace")).toBe(true);
  });
  it("gives native the exact registered face per weight", () => {
    expect(fontFace("sans", "400", "native").fontFamily).toBe("IBMPlexSans");
    expect(fontFace("sans", "500", "native").fontFamily).toBe("IBMPlexSans-Medium");
    expect(fontFace("sans", "600", "native").fontFamily).toBe("IBMPlexSans-SemiBold");
    expect(fontFace("mono", "500", "native").fontFamily).toBe("IBMPlexMono-Medium");
  });
  it("clamps unbundled weights to the heaviest shipped face", () => {
    expect(bundledWeight("700")).toBe("600");
    expect(bundledWeight("bold")).toBe("600");
    expect(bundledWeight(500)).toBe("500");
    expect(bundledWeight("normal")).toBe("400");
    expect(fontFace("mono", "700", "native")).toEqual({ fontFamily: "IBMPlexMono-Medium", fontWeight: "600" });
  });
});

describe("type scale", () => {
  it("keeps mono for readouts and labels only", () => {
    expect(typeScale.monoLabel.font).toBe("mono");
    expect(typeScale.body.font).toBe("sans");
    expect(typeScale.monoLabel.uppercase).toBe(true);
  });
  it("scales size, leading and tracking together", () => {
    const s = scaledStep(typeScale.display, 2);
    expect(s).toMatchObject({ fontSize: 64, lineHeight: 76, letterSpacing: -1.28 });
    expect(scaledStep(typeScale.body, 1)).toMatchObject({ fontSize: 16, lineHeight: 25 });
  });
  it("offers steps up to 200 % and no further", () => {
    expect(TEXT_SCALES[TEXT_SCALES.length - 1]).toBe(MAX_TEXT_SCALE);
    expect(Math.max(...TEXT_SCALES)).toBe(2);
    expect(TEXT_SCALES).toContain(1);
  });
});
