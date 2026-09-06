import { describe, expect, it } from "vitest";
import { markdownToText, mathToPlain, parseMarkdown } from "../src/index";

describe("mathToPlain", () => {
  it("turns the arithmetic a small model writes into readable text", () => {
    expect(mathToPlain("17 \\times 23")).toBe("17 × 23");
    expect(mathToPlain("17 \\times 23 = 17 \\times (20 + 3) = (17 \\times 20) + (17 \\times 3)")).toBe(
      "17 × 23 = 17 × (20 + 3) = (17 × 20) + (17 × 3)",
    );
    expect(mathToPlain("\\frac{1}{2} + \\frac{a+b}{c}")).toBe("1/2 + (a+b)/c");
    expect(mathToPlain("\\sqrt{16} = 4, \\sqrt{x+1}, \\sqrt[3]{8}")).toBe("√16 = 4, √(x+1), ³√8");
    expect(mathToPlain("x^{2} + y^2 = r^{10}")).toBe("x² + y² = r¹⁰");
    expect(mathToPlain("a_1 + a_{n+1} + e^{i\\pi}")).toBe("a₁ + aₙ₊₁ + e^(iπ)");
    expect(mathToPlain("90^\\circ, 5\\%, \\$20")).toBe("90°, 5%, $20");
    expect(mathToPlain("\\text{speed} = \\frac{\\text{distance}}{\\text{time}}")).toBe("speed = distance/time");
    expect(mathToPlain("\\left( x \\right) \\cdot y \\le z \\ne w")).toBe("( x ) · y ≤ z ≠ w");
    expect(mathToPlain("\\unknowncmd{x}")).toBe("unknowncmdx");
  });

  it("is applied to $…$, $$…$$, \\(…\\) and \\[…\\] in Markdown", () => {
    const text = markdownToText("To find $17 \\times 23$:\n\n$$17 \\times 23 = 391$$\n\nAlso \\(2^3 = 8\\) and\n\\[\n\\frac{1}{4}\n\\]");
    expect(text).toBe("To find 17 × 23:\n\n17 × 23 = 391\n\nAlso 2³ = 8 and\n\n1/4");
    const blocks = parseMarkdown("\\[\nE = mc^2\n\\]");
    expect(blocks).toEqual([{ type: "math", text: "E = mc²" }]);
  });

  it("leaves prices and plain dollars alone", () => {
    expect(markdownToText("It costs $5 and $10 today")).toBe("It costs $5 and $10 today");
  });
});
