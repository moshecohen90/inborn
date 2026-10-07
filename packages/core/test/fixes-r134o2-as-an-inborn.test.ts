import { describe, expect, it } from "vitest";
import { BUILT_IN_PERSONAS, turnSystemPrompt, withoutEchoedRules } from "../src/index";

const instructions = turnSystemPrompt({ familySafe: true, tier: "instant", photos: false, persona: BUILT_IN_PERSONAS[0], languageHint: "Answer in English.", length: "Answer in two to four short paragraphs." });
const net = (question: string, answer: string, streaming = false) => withoutEchoedRules(answer, { instructions, question, streaming });

/* The 134O sim, Instant, sleep tips (docs/qa/r134n-identity-card/o/answers.txt pi3-06), word for word. */
const PI3_06 =
  "As an Inborn, I am here to help you with your child's sleep needs. For a 4-year-old, the most effective tips include establishing a consistent bedtime routine and ensuring their bedroom is pitch dark and cool; try keeping it around 65°F (18°C). If they still wake up during the night or have trouble staying asleep, consider bringing on a gentle story book for them to read. Remember that your child's sleep is essential for their development; please ask them when you can return to bed.";
const TIPS = PI3_06.slice(PI3_06.indexOf("For a 4-year-old"));

describe("round 134O2 · the identity pasted as \"As an Inborn\" is cut like \"as Inborn\"", () => {
  it("pi3-06: the whole opening sentence goes (it holds nothing but the identity), the tips stay word for word", () => {
    expect(net("my 4 year old won't sleep, any tips?", PI3_06)).toBe(TIPS);
  });

  it("while streaming, the opening never shows, not even its first words", () => {
    for (let n = 1; n <= PI3_06.length; n += 3) expect(net("my 4 year old won't sleep, any tips?", PI3_06.slice(0, n), true), String(n)).not.toMatch(/^As|Inb/);
  });

  it("\"as a\", \"as an\" and \"as\" are the same rule; asked about the app, the sentence stays", () => {
    for (const opening of ["As Inborn", "As an Inborn", "As a Inborn", "as an Inborn"]) expect(net("give me a pancake recipe", `${opening}, I can help. Mix flour and milk.`), opening).toBe("Mix flour and milk.");
    expect(net("what can you do as Inborn?", "As an Inborn assistant, I help with writing and translation.")).toBe("As an Inborn assistant, I help with writing and translation.");
  });

  it("the English adjective \"inborn\" is left alone", () => {
    expect(net("give me a pancake recipe", "As an inborn talent, cooking comes easily to some. Mix flour and milk.")).toBe("As an inborn talent, cooking comes easily to some. Mix flour and milk.");
  });
});
