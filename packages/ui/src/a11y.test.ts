import { describe, expect, it } from "vitest";
import { hiddenFromScreenReaders } from "./a11y";

describe("hiddenFromScreenReaders (F371)", () => {
  it.each(["ios", "android"])("keeps the native props on %s", (os) => {
    expect(hiddenFromScreenReaders(os)).toEqual({ accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" });
  });
  it("gives the web only aria-hidden, which the DOM understands", () => {
    expect(hiddenFromScreenReaders("web")).toEqual({ "aria-hidden": true });
  });
});
