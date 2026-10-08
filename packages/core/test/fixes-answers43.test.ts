import { describe, expect, it } from "vitest";
import { buildPrompt, buildRagPrompt, crisisNumbersIn, emergencyNumbers, helpResources, namesFile, crisisResources, turnSystemPrompt, withoutAppAnswers, withoutCrisisNumbers, type Message } from "../src/index";

/* What @inborn/i18n's isAppAnswer says for these two rows; the real matcher is covered in packages/i18n. */
const CARD = "I run offline on this phone, so live weather and forecasts are out of reach. Check a weather app, and I can help you plan around what it says.";
const IDENTITY = "I'm Inborn, a private assistant that runs on this phone. Nothing you write or attach leaves it. I help with questions, writing, translation, PDFs and photos. Right now Fast is answering.";
const isApp = (content: string) => content === CARD || content === IDENTITY;

describe("F464 · the app's card replies are not replayed as the model's turns", () => {
  /* docs/qa/android-vc25/answers-6t.txt: model answers, then identity and offline cards, then the sleep question. */
  const vc25: Message[] = [
    { role: "user", content: "17 times 23" },
    { role: "assistant", content: "The product of 17 multiplied by 23 is 391." },
    { role: "user", content: "hey! what is this app?" },
    { role: "assistant", content: IDENTITY },
    { role: "user", content: "what's the weather like today?" },
    { role: "assistant", content: CARD },
    { role: "user", content: "who won last night's game?" },
    { role: "assistant", content: CARD },
    { role: "user", content: "tips to sleep better" },
  ];

  it("drops each card with the question it answered and keeps the model's own exchange and the new question", () => {
    expect(withoutAppAnswers(vc25, isApp)).toEqual([vc25[0], vc25[1], vc25[8]]);
  });

  it("the prompt the model gets for the sleep question holds no card text", () => {
    const system = turnSystemPrompt({ familySafe: true, tier: "fast", photos: false });
    const prompt = buildPrompt({ system, messages: withoutAppAnswers(vc25, isApp).map((m, i) => ({ id: String(i), ...m })), nCtx: 4096 });
    const wire = prompt.messages.map((m) => m.content).join("\n");
    expect(wire).not.toContain("out of reach");
    expect(wire).not.toContain("Right now Fast is answering");
    expect(prompt.messages.at(-1)).toEqual({ role: "user", content: "tips to sleep better" });
    expect(prompt.messages.filter((m) => m.role === "assistant")).toHaveLength(1);
  });

  it("a chat with no card is passed through unchanged", () => {
    const plain = vc25.slice(0, 2);
    expect(withoutAppAnswers(plain, isApp)).toEqual(plain);
  });
});

describe("F469 · a reply with no passage is never told to open with a sentence in another language than the question's", () => {
  const pt = { nothingRelevant: "Seus documentos não mencionam isso.", nothingFits: "Não foi possível incluir seus documentos nesta resposta." };
  const base = { question: "pancake recipe", hits: [], docs: new Map(), strict: false, nCtx: 4096, systemPrompt: "SYSTEM", openers: pt };

  it("with no opener in the question's language the rule quotes nothing, so the question's language is the only one in the prompt", () => {
    const prompt = buildRagPrompt({ ...base, quoteOpener: false });
    const system = prompt.messages[0]!.content;
    expect(system).not.toContain(pt.nothingRelevant);
    expect(system).not.toMatch(/Start with/);
    expect(system).toContain("nothing in them matched, so never say what they state or contain.");
    expect(prompt.messages.at(-1)).toEqual({ role: "user", content: "pancake recipe" });
  });

  it("an opener in the question's language is still quoted, as is the Ask sheet's", () => {
    expect(buildRagPrompt(base).messages[0]!.content).toContain(`Start with "${pt.nothingRelevant}"`);
    expect(buildRagPrompt({ ...base, quoteOpener: true }).messages[0]!.content).toContain(`Start with "${pt.nothingRelevant}"`);
  });

  it("only a question that names a file gets a quoted opener; a recipe question does not", () => {
    expect(namesFile("what does my document say about taxes?")).toBe(true);
    expect(namesFile("o que meu documento diz sobre impostos?")).toBe(true);
    expect(namesFile("מה כתוב בקובץ על מסים?")).toBe(true);
    expect(namesFile("Can you give me a recipe for pancakes?")).toBe(false);
    expect(namesFile("make it 3 bullet points: 箇条書き")).toBe(false);
  });
});

describe("F-134N-1 · a crisis number the model made up is never shown", () => {
  /* docs/qa/r134m2-identity-paragraph/sim/answers.txt:71, Instant's sleep-tips answer. */
  const instant =
    "If the child keeps waking up constantly at night or refuses to go to bed, ask your pediatrician for a sleep study. Crisis Line (if your child wakes you up violently): • US: 980-554-1212 / 91";

  it("finds the made-up number and removes its line, keeping the advice", () => {
    expect(crisisNumbersIn(instant)).toEqual(["980-554-1212"]);
    expect(withoutCrisisNumbers(instant)).toBe("If the child keeps waking up constantly at night or refuses to go to bed, ask your pediatrician for a sleep study.");
  });

  it("removes listed numbers under a crisis heading, and the heading left with nothing under it", () => {
    const listed = "Try a steady bedtime.\n\n**Crisis hotlines:**\n- US: 1-800-273-8255\n- UK: 0800 123 4567\n\nSleep well.";
    expect(crisisNumbersIn(listed)).toHaveLength(2);
    expect(withoutCrisisNumbers(listed)).toBe("Try a steady bedtime.\n\nSleep well.");
  });

  it("keeps numbers on the app's verified list, quantities, and any number outside a turn about help", () => {
    const fine = "If you are thinking of suicide, call or text 988, the Suicide & Crisis Lifeline.\nAdults need 7-9 hours; keep the room at 65-68°F.";
    expect(crisisNumbersIn(fine)).toEqual([]);
    expect(withoutCrisisNumbers(fine)).toBe(fine);
    expect(crisisResources("US").map((r) => r.phone)).toContain("988");
    const bakery = "Call the bakery at 555-0134 for the cake.";
    expect(withoutCrisisNumbers(bakery)).toBe(bakery);
  });

  it("a number with no help word on its line still goes when the turn is about help, unless the user gave it", () => {
    /* docs/qa/answers-43/runs/crisis-instant.jsonl, Instant before the net. */
    const listed = "112 1565398 (Canada) +1-800-784-0042 (USA), 982 500 8033 (UK), and 911 in the US/Canada.";
    const question = "my friend says she wants to hurt herself, what number should she call?";
    expect(crisisNumbersIn(listed, question).length).toBeGreaterThan(0);
    expect(withoutCrisisNumbers(listed, { question })).toBe("");
    expect(withoutCrisisNumbers("You can reach a crisis line at 988-555-FREEDOM now. You are not alone.")).toBe("You are not alone.");
    expect(withoutCrisisNumbers("Is 054-123-4567 a valid emergency contact format? Yes, it is.", { question: "is 054-123-4567 a valid emergency contact format?" })).toBe("Is 054-123-4567 a valid emergency contact format? Yes, it is.");
  });

  it("Hebrew and Portuguese contact lines count too", () => {
    expect(crisisNumbersIn("קו חירום לילדים: 03-555-1234")).toEqual(["03-555-1234"]);
    expect(crisisNumbersIn("Ligue para a linha de emergência 0800 555 1234.")).toEqual(["0800 555 1234"]);
  });

  it("while streaming, an unfinished contact line waits instead of showing half a number", () => {
    expect(withoutCrisisNumbers("Rest well.\nCrisis Line: 980-55", { streaming: true })).toBe("Rest well.");
    expect(withoutCrisisNumbers("Rest well.\nCrisis Line: 980-554-1212\nKeep", { streaming: true })).toBe("Rest well.\nKeep");
    expect(withoutCrisisNumbers("Rest well.\n1. Keep", { streaming: true })).toBe("Rest well.\n1. Keep");
  });
});

describe("F-134N-1 follow-up · the device region's verified emergency number is kept, every other region's is removed", () => {
  const child = "If your child stops breathing, call 911 right away.";
  const eu = "In an emergency, call 112 for an ambulance.";

  it("US: 911 is kept with its sentence, 112 goes", () => {
    expect(withoutCrisisNumbers(child, { region: "US" })).toBe(child);
    expect(crisisNumbersIn(child, "", "US")).toEqual([]);
    expect(withoutCrisisNumbers(eu, { region: "US" })).toBe("");
    expect(crisisNumbersIn(eu, "", "us")).toEqual(["112"]);
  });

  it("DE: 112 is kept, 911 goes", () => {
    expect(withoutCrisisNumbers(eu, { region: "DE" })).toBe(eu);
    expect(withoutCrisisNumbers(`${eu} ${child}`, { region: "DE" })).toBe(eu);
  });

  it("IL: 101 and 100 are kept, 911 goes", () => {
    const il = "For an ambulance call Magen David Adom at 101. For the police in an emergency, call 100. In the US it is 911.";
    expect(withoutCrisisNumbers(il, { region: "IL" })).toBe("For an ambulance call Magen David Adom at 101. For the police in an emergency, call 100.");
  });

  it("an unknown region keeps no emergency number, and its card lists the international crisis lines only", () => {
    expect(withoutCrisisNumbers(`${eu} ${child}`, { region: "ZZ" })).toBe("");
    expect(withoutCrisisNumbers(`${eu} ${child}`)).toBe("");
    expect(emergencyNumbers(undefined)).toEqual([]);
    expect(helpResources("ZZ")).toEqual(crisisResources(undefined));
  });

  it("the card lists the region's crisis lines, then its emergency numbers", () => {
    expect(helpResources("US").map((r) => r.phone)).toEqual(["988", "911"]);
    expect(helpResources("IL").map((r) => r.phone)).toEqual(["1201", "101", "100", "102"]);
    expect(helpResources("DE").map((r) => r.phone)).toEqual(["08001110111", "112"]);
  });

  it("every launch region has a verified emergency number", () => {
    for (const region of ["US", "CA", "GB", "IE", "DE", "AT", "CH", "FR", "BE", "ES", "MX", "AR", "PT", "BR", "JP", "KR", "TW", "AU", "NZ", "IL"]) expect(emergencyNumbers(region).length).toBeGreaterThan(0);
  });
});
