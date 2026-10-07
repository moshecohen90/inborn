import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LAUNCH_LOCALES, offlineAnswer } from "../src";

const KINDS = ["weather", "news", "scores", "prices"] as const;
const LANGS = [...LAUNCH_LOCALES, "he"] as const;
const table = (lang: string): Record<string, string> => JSON.parse(readFileSync(join(__dirname, lang === "he" ? "../answers/he.json" : `../locales/${lang}.json`), "utf8"));

describe("round 134O · the app's answer to a live-data question", () => {
  it("every UI locale and Hebrew has the four keys", () => {
    for (const lang of LANGS) for (const kind of KINDS) expect(table(lang)[`offline.answer.${kind}`], `${lang}:${kind}`).toBeTruthy();
  });

  it("two plain sentences per kind, every device, with no number a reader could take for live data", () => {
    for (const lang of LANGS)
      for (const kind of KINDS)
        for (const device of ["phone", "tablet", "computer", "browser"]) {
          const text = offlineAnswer(kind, lang, { device });
          expect(text, `${lang} ${kind}`).not.toMatch(/[{}\d]|°|qwen|family|crisis/i);
          expect(text.split(/(?<=[.。!?！？])\s*/).filter((s) => s.trim()).length, `${lang} ${kind}: ${text}`).toBe(2);
        }
  });

  it("in English and in Hebrew, word for word", () => {
    expect(offlineAnswer("weather", "en", { device: "phone" })).toBe("I run offline on this phone, so live weather and forecasts are out of reach. Check a weather app, and I can help you plan around what it says.");
    expect(offlineAnswer("scores", "he", { device: "phone" })).toBe("אני פועל בטלפון הזה בלי אינטרנט, ולכן תוצאות ומשחקים בזמן אמת לא זמינים לי. אוכל להסביר את החוקים, את ההיסטוריה של קבוצה או משחק שתתארו.");
    expect(offlineAnswer("prices", "xx", { device: "phone" })).toBe(offlineAnswer("prices", "en", { device: "phone" }));
  });
});
