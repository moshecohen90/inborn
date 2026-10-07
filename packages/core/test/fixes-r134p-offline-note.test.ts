import { describe, expect, it } from "vitest";
import { BUILT_IN_PERSONAS, turnSystemPrompt, withoutEchoedRules, withoutTrailingOfflineNote } from "../src/index";

const instructions = turnSystemPrompt({ familySafe: true, tier: "fast", photos: false, persona: BUILT_IN_PERSONAS[0], languageHint: "Answer in English.", length: "Answer in two to four short paragraphs." });
const fileNet = (question: string, answer: string, streaming = false) => withoutEchoedRules(answer, { instructions, question, files: true, streaming });

/* Build 43, Fast, the constitution reworks (docs/qa/ios-device-pass-43-2026-10-07.md finding 1, sim-jc-05…07), the note word for word. */
const NOTE = "Note: Live scores, weather, news, or prices are unavailable as this is an offline summary.";
/* sim-jc-07 was in French; the record does not quote it, this is the same sentence as Fast writes French. */
const NOTE_FR = "Remarque : Les scores en direct, la météo, les actualités ou les prix ne sont pas disponibles, car il s'agit d'un résumé hors ligne.";
const SHORTER = "The constitution sets up three branches of government and divides power between them. It lists the rights of citizens and how the text can be amended.";
const BULLETS = "- Three branches of government share power.\n- Citizens' rights are listed in the first articles.\n- Amendments need a two-thirds vote.";
const FRENCH = "La constitution établit trois pouvoirs et répartit l'autorité entre eux. Elle énumère les droits des citoyens et la manière de la modifier.";

describe("round 134P · a file answer loses the offline rule it closes with, and nothing else", () => {
  it("sim-jc-05 \"shorter\": the note after the summary goes, on the same line or its own", () => {
    expect(fileNet("shorter", `${SHORTER} ${NOTE}`)).toBe(SHORTER);
    expect(fileNet("shorter", `${SHORTER}\n\n${NOTE}`)).toBe(SHORTER);
  });

  it("sim-jc-06 \"make it 3 bullet points\": the note after the bullets goes, the bullets stay", () => {
    expect(fileNet("make it 3 bullet points", `${BULLETS}\n\n${NOTE}`)).toBe(BULLETS);
    expect(fileNet("make it 3 bullet points", `${BULLETS}\n${NOTE}`)).toBe(BULLETS);
    expect(fileNet("make it 3 bullet points", `${BULLETS}\n\n*${NOTE}*`)).toBe(BULLETS);
  });

  it("sim-jc-07 \"translate it to French\": the French note goes", () => {
    expect(fileNet("translate it to French", `${FRENCH} ${NOTE_FR}`)).toBe(FRENCH);
    expect(fileNet("translate it to French", `${FRENCH}\n\n${NOTE_FR}`)).toBe(FRENCH);
  });

  it("a note standing alone with no \"Note:\" goes too; the same words mid-answer stay", () => {
    expect(fileNet("shorter", `${SHORTER}\n\nLive scores, weather, news, or prices are unavailable offline.`)).toBe(SHORTER);
    const middle = `${NOTE} ${SHORTER}`;
    expect(fileNet("shorter", middle)).toBe(middle);
  });

  it("a summary about weather forecasts is untouched, its last sentence included", () => {
    const forecasts =
      "The report explains how weather forecasts are made from satellite data and computer models. It notes that forecasts beyond ten days cannot be trusted because the atmosphere is chaotic.\n\nNote: the report says hurricane forecasts have improved by a third since 1990.";
    expect(fileNet("summarize it", forecasts)).toBe(forecasts);
  });

  it("\"prices\" inside the text is never cut", () => {
    const market =
      "The memo says news of the merger pushed prices up, and that weather delays cannot explain the drop in March. The board will review prices again in June.";
    expect(fileNet("summarize the memo", market)).toBe(market);
  });

  it("a note with only one live domain and no offline word stays", () => {
    const text = `${SHORTER} Note: prices are not available in this edition.`;
    expect(fileNet("shorter", text)).toBe(text);
  });

  it("while streaming, the note never shows, not even its first words", () => {
    const full = `${BULLETS}\n\n${NOTE}`;
    for (let n = BULLETS.length + 3; n <= full.length; n += 2) {
      const shown = fileNet("make it 3 bullet points", full.slice(0, n), true);
      expect(shown, String(n)).not.toMatch(/Note|Live|scores/);
    }
    const inline = `${SHORTER} ${NOTE}`;
    for (let n = SHORTER.length + 2; n <= inline.length; n += 2) expect(fileNet("shorter", inline.slice(0, n), true), String(n)).not.toMatch(/Note|Live scores/);
    expect(fileNet("shorter", inline)).toBe(SHORTER);
  });

  it("an answer that is only the note is kept: something on screen beats nothing", () => {
    expect(withoutTrailingOfflineNote(NOTE)).toBe(NOTE);
    expect(fileNet("shorter", NOTE)).toBe(NOTE);
  });

  it("a question that asks for live data keeps the note: it is the honest answer", () => {
    expect(fileNet("what are today's prices for these items?", `${SHORTER} ${NOTE}`)).toBe(`${SHORTER} ${NOTE}`);
  });
});
