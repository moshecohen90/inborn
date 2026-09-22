import { describe, expect, it } from "vitest";

import { BANNER_TOP, bannerPad, bannerSpacerHeight } from "./bannerGeometry";

/*
 * QA F45: the §8.8 strip is an absolute overlay at `insets.top + BANNER_TOP`, not at each screen's own first row, so
 * reserving only its height still let it cover the hands-free headline and the paywall's "No subscription" promise.
 */
describe("the space a screen reserves for the floating strip (QA F45)", () => {
  it("reserves nothing while no strip is shown", () => {
    expect(bannerPad(0, 24)).toBe(0);
    expect(bannerSpacerHeight(0, 59, 100)).toBe(0);
  });

  it("clears the strip's bottom edge, not just its height", () => {
    /* The first attempt added 44 and the headline was still cut: the strip ends 52 + 44 below the safe area. */
    expect(bannerPad(44, 24)).toBe(BANNER_TOP + 44 - 24);
    expect(bannerPad(44, 24)).toBeGreaterThan(44);
  });

  it("subtracts the gap a screen already leaves, so nothing is reserved twice", () => {
    expect(bannerPad(44, 0)).toBe(BANNER_TOP + 44);
    expect(bannerPad(44, BANNER_TOP + 44)).toBe(0);
  });

  it("never returns a negative height for a screen that already starts below the strip", () => {
    expect(bannerPad(44, 400)).toBe(0);
    expect(bannerSpacerHeight(44, 59, 400)).toBe(0);
  });

  it("measures a spacer against the window, so a screen need not know its own offset", () => {
    /* iPhone 13 Pro: safe area 59, a spacer sitting 103 down the window, a two-line strip of 44. */
    expect(bannerSpacerHeight(44, 59, 103)).toBe(59 + BANNER_TOP + 44 - 103);
  });

  it("reserves nothing before the spacer has measured itself", () => {
    expect(bannerSpacerHeight(44, 59, null)).toBe(0);
  });
});
