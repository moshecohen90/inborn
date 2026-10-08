import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPrompt, selfQuestionMatch, liveDataQuestionMatch, withoutAppAnswers, type Message } from "@inborn/core";
import { isAppDecline, offlineAnswer, selfAnswer } from "@inborn/i18n";

const read = (path: string) => readFileSync(join(__dirname, path), "utf8");
const chat = read("../src/screens/Chat.tsx");
const generate = chat.slice(chat.indexOf("const generate = async"), chat.indexOf("const submit = async"));

describe("F464 · the app's offline cards are not replayed as the model's turns", () => {
  it("every history the Chat screen sends (submit, regenerate, meter, summary) goes through wire(), which drops them", () => {
    expect(chat).toMatch(/const wire = \(rows: readonly Row\[\]\)[^=]*=>\s*withoutAppAnswers\(/);
    expect(chat.slice(chat.indexOf("const wire = "), chat.indexOf("const toMessage = "))).toContain("isAppDecline,");
  });

  it("the vc25 sequence: after the cards, the sleep question reaches the model with no card text and the identity cards kept", () => {
    const rows: Message[] = [];
    for (const q of ["hey! what is this app?", "what can you do?", "what's the weather like today?", "who won last night's game?", "what's the weather tomorrow?"]) {
      const self = selfQuestionMatch(q, "en");
      const live = self ? null : liveDataQuestionMatch(q, "en");
      const answer = self ? selfAnswer(self.kind, self.lang, { device: "phone", model: "Fast" }) : offlineAnswer(live!.kind, live!.lang, { device: "phone" });
      rows.push({ role: "user", content: q }, { role: "assistant", content: answer });
    }
    rows.push({ role: "user", content: "tips to sleep better" });
    const sent = buildPrompt({ system: "S", messages: withoutAppAnswers(rows, isAppDecline).map((m, i) => ({ id: String(i), ...m })), nCtx: 4096 }).messages;
    const text = sent.map((m) => m.content).join("\n");
    expect(text).not.toContain("out of reach");
    expect(text).toContain("I'm Inborn");
    expect(sent.filter((m) => m.role === "user").map((m) => m.content)).toEqual(["hey! what is this app?", "what can you do?", "tips to sleep better"]);
  });
});

describe("F469 · the chat quotes an opener only in the question's language", () => {
  it("the chat's document search picks it from the question; the Ask sheet keeps its own", () => {
    const hooks = read("../src/documents/hooks.ts");
    expect(hooks).toContain("const asked = namesFile(question) ? questionOpeners(detectLanguage(question)) : null;");
    expect(hooks).toContain("openers: { ...noPassageOpeners(t), ...asked }, quoteOpener: !!asked,");
    expect(read("../src/documents/library.ts")).toContain("opening, quoteOpener: o.quoteOpener });");
    expect(read("../src/screens/documents/AskDocuments.tsx")).not.toContain("quoteOpener");
  });
});

describe("F-134N-1 · a crisis number the model made up is never shown", () => {
  it("every text the chat shows goes through the net, judged against the user's question", () => {
    expect(generate).toContain("const shown = (): string => withoutCrisisNumbers(echoNetted(), { streaming: live, question: askedNow });");
    expect(generate).toContain("askedNow = asked;");
  });

  it("a removed number raises the app's verified card, and an answer left empty says the card's line", () => {
    const after = generate.slice(generate.indexOf("const madeUpNumbers = "), generate.indexOf("const reason = stopReason.current;"));
    expect(after).toContain("crisisNumbersIn(reply, asked)");
    expect(after).toContain("setSafety(crisisResources(getLocales()[0]?.regionCode ?? undefined));");
    expect(after).toContain('reply = t("safety.title");');
  });

  it("hands-free voice shows and keeps only the netted answer", () => {
    const voice = read("../src/voice/useHandsFree.ts");
    expect(voice).toContain("withoutCrisisNumbers(reply, { streaming: true, question: effect.text })");
    expect(voice).toContain("else reply = withoutCrisisNumbers(reply, { question: effect.text });");
  });
});
