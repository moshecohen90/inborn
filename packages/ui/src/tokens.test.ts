import { describe, expect, it } from "vitest";
import { bundledWeight, compactChrome, contrastRatio, dark, fontFace, fonts, light, scaledStep, typeScale, withAlpha, TEXT_SCALES, MAX_TEXT_SCALE } from "./tokens";

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
  /* The three semantic inks were the gap F157 left open: untested, and danger on its own fill was 3.10:1 (QA F109). */
  it("the semantic inks reach 4.5:1 on every surface too, in both schemes", () => {
    for (const [name, theme] of [["dark", dark], ["light", light]] as const)
      for (const surface of ["bg", "surface1", "surface2", "well"] as const)
        for (const ink of ["danger", "accent", "sealed"] as const)
          expect(contrastRatio(theme[ink], theme[surface]), `${name} ${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });
  it("text on the danger fill reaches 4.5:1, which is the delete and wipe buttons", () => {
    for (const [name, theme] of [["dark", dark], ["light", light]] as const)
      expect(contrastRatio(theme.onDanger, theme.danger), `${name} onDanger on danger`).toBeGreaterThanOrEqual(4.5);
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

describe("withAlpha", () => {
  it("appends the alpha byte to a 6-digit hex colour", () => {
    expect(withAlpha("#0B0D10", 0.72)).toBe("#0B0D10B8");
    expect(withAlpha("#ffffff", 1)).toBe("#ffffffFF");
    expect(withAlpha("#000000", 0)).toBe("#00000000");
  });
  it("clamps alpha and leaves non-hex colours alone", () => {
    expect(withAlpha("#0B0D10", 2)).toBe("#0B0D10FF");
    expect(withAlpha("#0B0D10", -1)).toBe("#0B0D1000");
    expect(withAlpha("rgba(0,0,0,0.5)", 0.5)).toBe("rgba(0,0,0,0.5)");
    expect(withAlpha("#0B0D10B8", 0.5)).toBe("#0B0D10B8");
  });
});

describe("compactChrome", () => {
  it("keeps the seal caption up to 130 % and drops it from 150 %", () => {
    expect(compactChrome(1)).toBe(false);
    expect(compactChrome(1.3)).toBe(false);
    expect(compactChrome(1.5)).toBe(true);
    expect(compactChrome(2)).toBe(true);
  });
});
