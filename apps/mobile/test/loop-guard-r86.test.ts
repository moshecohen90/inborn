import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * F369. Instant looped one Japanese sentence to the ceiling; the old guard only matched when the text happened to end
 * on a copy at an 8-token checkpoint, and it left every copy on screen. The chat now streams every engine through
 * core's guardLoops, shows the cut answer, and keeps the notice across a reload.
 */
const repo = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");
const chat = read("apps/mobile/src/screens/Chat.tsx");
const message = read("apps/mobile/src/components/chat/AssistantMessage.tsx");
const LOCALES = ["en", "de", "es", "fr", "pt-BR", "ja", "ko", "zh-Hant"];

describe("F369 · the chat answers through the loop guard", () => {
  it("wraps the answer stream of whatever engine is loaded", () => {
    expect(chat).toMatch(/for await \(const d of guardLoops\(engine\.generate\(s, messages, opts, ac\.signal\), stopLoop\)\)/);
  });

  it("stopping aborts generation and marks the turn a loop", () => {
    const stop = chat.slice(chat.indexOf("const stopLoop = () => {"), chat.indexOf("};", chat.indexOf("const stopLoop = () => {")));
    expect(stop).toContain('stopReason.current = "loop"');
    expect(stop).toContain("ac.abort()");
  });

  it("shows the cut text, logs one line for QA, and persists the stop as a loop", () => {
    expect(chat).toMatch(/if \(d\.loop\) \{[\s\S]{0,200}reply = d\.loop\.text;/);
    expect(chat).toContain("console.log(describeLoopCut(d.loop))");
    expect(chat).toMatch(/loopCut \? "loop"/);
    expect(chat).not.toMatch(/detectLoop\(/);
  });

  it("the notice sits under the message, offers Regenerate, never Continue", () => {
    expect(message).toContain('testID="loop-notice"');
    expect(message).toContain('row.stoppedBy === "loop"');
    expect(message).toMatch(/"chat\.loopCut" : "chat\.loopCutRetry"/);
    expect(message).toMatch(/!looped && row\.stopped && onContinue/);
  });

  it("the notice is translated in every locale, and the old half-sentence is gone", () => {
    for (const l of LOCALES) {
      const strings = JSON.parse(read(`packages/i18n/locales/${l}.json`)) as Record<string, string>;
      expect(strings["chat.loopCut"], l).toMatch(/Fast/);
      expect(strings["chat.loopCutRetry"], l).toBeTruthy();
      expect(strings["chat.loopDetected"], l).toBeUndefined();
    }
  });
});
