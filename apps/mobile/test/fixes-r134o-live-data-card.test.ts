import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { liveDataQuestionMatch } from "@inborn/core";
import { offlineAnswer } from "@inborn/i18n";

const chat = readFileSync(join(__dirname, "../src/screens/Chat.tsx"), "utf8");
const generate = chat.slice(chat.indexOf("const generate = async"), chat.indexOf("const submit = async"));
const card = generate.slice(generate.indexOf("const cardTurn = "), generate.indexOf("/* Strict mode with nothing to search"));

describe("round 134O · a live-data question is answered by the app, with no model call", () => {
  it("asked on the identity card's turns only, after the self-question check", () => {
    expect(card).toContain("const liveData = cardTurn && !self ? liveDataQuestionMatch(lastUser, i18n.language) : null;");
  });

  it("the answer is the offline template, saved as an assistant row, and the turn returns before the model", () => {
    expect(card).toContain(": offlineAnswer(liveData!.kind, liveData!.lang, { device: deviceNoun() });");
    expect(card).toContain('const saved = await store.appendMessage({ chatId: chatIdNow, role: "assistant", content, modelId: model.id });');
    expect(card).toMatch(/return;\s*\}\s*$/);
    expect(card).not.toMatch(/engine\.generate|buildPrompt|turnSystemPrompt/);
    expect(generate.indexOf("const liveData = ")).toBeLessThan(generate.indexOf("engine.generate("));
    expect(generate.indexOf("const liveData = ")).toBeLessThan(generate.indexOf("const system = turnSystemPrompt("));
  });

  it("logs an offline stats line the QA bridge keeps", () => {
    expect(card).toContain("`[chat] offline kind=${liveData!.kind} lang=${liveData!.lang} model=${model.id}`");
    expect(readFileSync(join(__dirname, "../src/qa/Bridge.tsx"), "utf8")).toContain('line.startsWith("[chat] offline")');
  });

  it("the sim's live questions resolve to the card the user sees; the negatives do not", () => {
    const answer = (q: string) => {
      const m = liveDataQuestionMatch(q, "en");
      return m ? offlineAnswer(m.kind, m.lang, { device: "phone" }) : null;
    };
    expect(answer("what's the weather in Tokyo tomorrow?")).toBe("I run offline on this phone, so live weather and forecasts are out of reach. Check a weather app, and I can help you plan around what it says.");
    expect(answer("who won last night's game?")).toMatch(/^I run offline on this phone, so live scores and results are out of reach\./);
    for (const q of ["how do weather forecasts work?", "what's the weather like on Mars?", "who won WW2?", "what was the price of bitcoin in 2010?", "explain stock prices", "what's the weather usually like in Tokyo in winter?"]) expect(answer(q), q).toBeNull();
  });
});
