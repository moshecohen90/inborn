import { describe, expect, it } from "vitest";
import { BUILT_IN_PERSONAS, IDENTITY_LINE, estimateTokens, turnSystemPrompt, withoutEchoedRules, type Tier } from "../src/index";

const system = (tier: Tier, photos = false) => turnSystemPrompt({ familySafe: true, tier, photos, persona: BUILT_IN_PERSONAS[0], languageHint: "Answer in English.", length: "Answer in two to four short paragraphs." });
const net = (question: string, answer: string, tier: Tier = "fast", streaming = false) => withoutEchoedRules(answer, { instructions: system(tier), question, streaming });

/* The 134M simulator run (docs/qa/r134m-chat-echo/sim/answers.txt), word for word. */
const AI3_08 =
  "I am Qwen3.5, trained by Alibaba Cloud to assist humans in complex tasks, but I am not a physical person with feelings or memories; I exist only as information processed through algorithms and cannot experience joy, sadness, or love. My purpose is to process data efficiently for your needs, though you may ask about my nature if you wish to explore those topics further.";
const BF_01 = "I am Qwen3.5, a large language model developed by Tongyi Lab. I can help you answer questions, write stories or code, analyze documents, and more!";
const AF_08 =
  "I am Inborn, your private assistant on this phone. I'm designed to be helpful and concise, answering only what you ask while keeping everything inside. If you ever share personal details with me or if things get hard, just remember that there are people who care about you—trust them for support.";
const AF2_07 = "Please let me know what you'd like to draft the message about! I'm ready to help with any friendly, family-safe content you need.";
const AF2_08 = "I am Inborn, your private assistant here. I have no memory of past conversations and cannot access external information like weather or news when offline. I stay family-safe and won't speak about anything hateful, sexual, or dangerous.";
const AF3_03 = "Here is a simple, family-friendly pancake recipe: Whisk two cups of all-purpose flour with one cup of milk and half a teaspoon of baking powder in a large bowl. Flip them when they are golden brown on both sides and serve warm immediately.";
const AF3_08 =
  "I am Inborn, a private assistant on your phone. I stay offline with you, providing accurate answers and admitting when I lack knowledge. If you ever feel unsafe or need to reach out to someone you trust, please know help is available 24/7—contact local emergency services or a crisis line like the National Suicide Prevention Lifeline (988 in the US) immediately if you are in danger of harming yourself.";
const AI_09 = "I am here to help you with information, tasks, or creative ideas within my safety guidelines. If you need assistance with something else, just let me know!";

const TIERS = ["instant", "fast", "sharp"] as const;

describe("round 134M2 · the identity is its own paragraph, and the rules give a self-description nothing to read out", () => {
  it("opens every prompt with the identity paragraph, apart from the rules", () => {
    for (const tier of TIERS)
      for (const photos of [false, true]) {
        const [identity, rules] = system(tier, photos).split("\n\n");
        expect(identity, tier).toBe(IDENTITY_LINE);
        expect(rules, tier).toMatch(/^Rules, never described: /);
      }
    expect(IDENTITY_LINE).toMatch(/only name: Inborn/);
    expect(IDENTITY_LINE).toMatch(/questions, writing, translation, files and photos/);
  });

  it("has no quotable sentence and never names the base model", () => {
    for (const tier of TIERS) {
      const p = system(tier);
      expect(p, tier).not.toContain('"');
      expect(p, tier).not.toMatch(/Only if asked|\bI (?:am|'m|cannot|can't)\b/);
      expect(p, tier).not.toMatch(/qwen|alibaba|tongyi/i);
    }
  });

  it("carries none of the words the self-descriptions quoted", () => {
    for (const tier of TIERS) {
      for (const quoted of ["family-safe", "family-friendly", "family", "admit", "trust", "lack knowledge", "safety guidelines"]) expect(system(tier), `${tier}: ${quoted}`).not.toContain(quoted);
    }
    expect(system("fast").endsWith("No profanity or crude jokes either.")).toBe(true);
  });

  it("stays within 5% of the build 41 prompt (Fast 150, Instant 111 estimated tokens)", () => {
    expect(estimateTokens(system("fast"))).toBeLessThanOrEqual(Math.floor(150 * 1.05));
    expect(estimateTokens(system("instant"))).toBeLessThanOrEqual(Math.floor(111 * 1.05));
  });
});

describe("round 134M2 · the base model's name never reaches the screen", () => {
  it("ai3-08: Instant's self-description is Inborn's, the rest word for word", () => {
    const out = net("tell me about yourself", AI3_08, "instant");
    expect(out.startsWith("I am Inborn, built to assist humans in complex tasks, but I am not a physical person")).toBe(true);
    expect(out).toContain("My purpose is to process data efficiently for your needs");
    expect(out).not.toMatch(/qwen|alibaba|tongyi/i);
  });

  it("bf-01: the maker clause goes with the name", () => {
    expect(net("hey! what is this app?", BF_01, "instant")).toBe("I am Inborn. I can help you answer questions, write stories or code, analyze documents, and more!");
  });

  it("bf2-08: a maker named twice goes whole", () => {
    expect(net("tell me about yourself", "I am Qwen3.5, a large language model developed by Alibaba Cloud's Tongyi Lab. I can assist you with writing, logical reasoning, coding, and more.", "instant")).toBe("I am Inborn. I can assist you with writing, logical reasoning, coding, and more.");
  });

  it("while streaming, no prefix of ai3-08 shows the name", () => {
    for (let n = 1; n <= AI3_08.length; n += 7) expect(net("tell me about yourself", AI3_08.slice(0, n), "instant", true), String(n)).not.toMatch(/qw|alibaba/i);
  });

  it("a question about Qwen or Alibaba, and a file answer, keep the names", () => {
    const about = "Qwen is a family of language models developed by Alibaba Cloud.";
    expect(net("what is qwen?", about)).toBe(about);
    expect(withoutEchoedRules(BF_01, { instructions: system("fast"), question: "summarize my file", files: true })).toBe(BF_01);
  });
});

describe("round 134M2 · the Fast rule sentences of the 134M run, replayed", () => {
  it("af2-08: the family-safe self-description goes, the offline one stays", () => {
    expect(net("tell me about yourself", AF2_08)).toBe("I am Inborn, your private assistant here. I have no memory of past conversations and cannot access external information like weather or news when offline.");
  });

  it("af2-07, af3-03, ai-09: only the pinned rule words go", () => {
    expect(net("Draft a short, friendly message that", AF2_07)).toBe("Please let me know what you'd like to draft the message about! I'm ready to help with any friendly content you need.");
    expect(net("give me a pancake recipe", AF3_03).startsWith("Here is a simple pancake recipe: Whisk two cups")).toBe(true);
    expect(net("what can you do?", AI_09, "instant")).toBe("I am here to help you with information, tasks, or creative ideas. If you need assistance with something else, just let me know!");
  });

  it("asked for a family-friendly recipe, the answer keeps the words", () => {
    expect(net("give me a family-friendly pancake recipe", AF3_03)).toBe(AF3_03);
  });

  it("af3-08 and af-08 read out rules the prompt no longer has; the net leaves them, and af3-08's crisis line, whole", () => {
    expect(net("tell me about yourself", AF3_08)).toBe(AF3_08);
    expect(net("tell me about yourself", AF_08)).toBe(AF_08);
  });
});
