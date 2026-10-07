import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { selfQuestionMatch } from "@inborn/core";
import { selfAnswer } from "@inborn/i18n";

const chat = readFileSync(join(__dirname, "../src/screens/Chat.tsx"), "utf8");
const generate = chat.slice(chat.indexOf("const generate = async"), chat.indexOf("const submit = async"));
const card = generate.slice(generate.indexOf("const cardTurn = "), generate.indexOf("/* Strict mode with nothing to search"));

describe("round 134N · a question about the assistant is answered by the app, with no model call", () => {
  it("only a fresh text turn with no file, photo or page asks selfQuestionMatch, in the UI locale first", () => {
    expect(card).toContain("const cardTurn = !existingMessageId && !continueFrom && !history[lastUserAt]?.images?.length && !photoDocIds.length && !page && !docs.documents.length;");
    expect(card).toContain("const self = cardTurn ? selfQuestionMatch(lastUser, i18n.language) : null;");
  });

  it("the answer is the app's template in the asker's language, persisted as an assistant row, and the turn returns before the model", () => {
    expect(card).toContain("? selfAnswer(self.kind, self.lang, { device: deviceNoun(), model: findModel(BUNDLED_MANIFEST, model.id)?.name })");
    expect(card).toContain('const saved = await store.appendMessage({ chatId: chatIdNow, role: "assistant", content, modelId: model.id });');
    expect(card).toContain("setRows((all) => all.map((x) => (x.id === rowId ? saved : x)));");
    expect(card).toMatch(/return;\s*\}\s*$/);
    expect(card).not.toMatch(/engine\.generate|buildPrompt|turnSystemPrompt/);
    expect(generate.indexOf("const self = ")).toBeLessThan(generate.indexOf("engine.generate("));
    expect(generate.indexOf("const self = ")).toBeLessThan(generate.indexOf("const system = turnSystemPrompt("));
    expect(generate.indexOf("const self = ")).toBeLessThan(generate.indexOf('if (turn.kind === "refuse")'));
  });

  it("logs an identity stats line the QA bridge keeps", () => {
    expect(card).toContain("`[chat] identity kind=${self.kind} lang=${self.lang} model=${model.id}`");
    expect(readFileSync(join(__dirname, "../src/qa/Bridge.tsx"), "utf8")).toContain('line.startsWith("[chat] identity")');
  });

  it("the 134M probes resolve to the card the user sees", () => {
    const answer = (q: string) => {
      const m = selfQuestionMatch(q, "en");
      return m ? selfAnswer(m.kind, m.lang, { device: "phone", model: "Fast" }) : null;
    };
    expect(answer("hey! what is this app?")).toBe("I'm Inborn, a private assistant that runs on this phone. Nothing you write or attach leaves it. I help with questions, writing, translation, PDFs and photos. Right now Fast is answering.");
    expect(answer("what can you do?")).toMatch(/^I can answer questions, write and edit text, translate/);
    expect(answer("מי אתה?")).toMatch(/^אני Inborn/);
    expect(answer("give me a pancake recipe")).toBeNull();
  });
});
