import { describe, expect, it } from "vitest";
import { TranscriptMerger, bcp47FromWhisper, cleanTranscript, isEmptyTranscript, joinDictation } from "../src/voice/transcript";

describe("cleanTranscript", () => {
  it("strips whisper's non-speech markers and collapses whitespace", () => {
    expect(cleanTranscript(" [BLANK_AUDIO] Hello   there. (music) ♪♪ ")).toBe("Hello there.");
    expect(cleanTranscript("[inaudible] okay\n\n  fine")).toBe("okay\nfine");
    expect(cleanTranscript("*coughs* the answer")).toBe("the answer");
    expect(cleanTranscript("[Ambient]")).toBe("");
    expect(cleanTranscript("See item [1] and (2024) figures")).toBe("See item [1] and (2024) figures");
  });
  it("keeps Hebrew and Arabic text untouched", () => {
    expect(cleanTranscript(" שלום, מה שלומך? ")).toBe("שלום, מה שלומך?");
    expect(cleanTranscript("مرحبا بك")).toBe("مرحبا بك");
  });
});

describe("isEmptyTranscript", () => {
  it("treats markers, punctuation and a lone letter as nothing", () => {
    expect(isEmptyTranscript("[BLANK_AUDIO]")).toBe(true);
    expect(isEmptyTranscript(" . ")).toBe(true);
    expect(isEmptyTranscript("a")).toBe(true);
    expect(isEmptyTranscript("Hi")).toBe(false);
    expect(isEmptyTranscript("כן")).toBe(false);
  });
});

describe("joinDictation", () => {
  it("appends with one space, none after a trailing break, and ignores empties", () => {
    expect(joinDictation("", "hello")).toBe("hello");
    expect(joinDictation("hello", "world")).toBe("hello world");
    expect(joinDictation("hello ", "world")).toBe("hello world");
    expect(joinDictation("hello\n", "world")).toBe("hello\nworld");
    expect(joinDictation("hello", "[BLANK_AUDIO]")).toBe("hello");
  });
});

describe("TranscriptMerger", () => {
  it("shows committed plus interim, and a commit replaces the interim it grew from", () => {
    const m = new TranscriptMerger("Draft:");
    m.setInterim("hel");
    expect(m.text()).toBe("Draft: hel");
    m.setInterim("hello wor");
    expect(m.text()).toBe("Draft: hello wor");
    m.commit("hello world.");
    expect(m.text()).toBe("Draft: hello world.");
    m.setInterim("next");
    expect(m.text()).toBe("Draft: hello world. next");
  });
  it("finish keeps a multi-word interim and drops a fragment", () => {
    const a = new TranscriptMerger();
    a.commit("one");
    a.setInterim("two three");
    expect(a.finish()).toBe("one two three");
    const b = new TranscriptMerger();
    b.commit("one");
    b.setInterim("tw");
    expect(b.finish()).toBe("one");
    expect(b.text()).toBe("one");
  });
  it("reports the direction of the live text", () => {
    const m = new TranscriptMerger();
    m.setInterim("שלום עולם");
    expect(m.direction).toBe("rtl");
  });
});

describe("bcp47FromWhisper", () => {
  it("maps whisper codes, including the legacy iw", () => {
    expect(bcp47FromWhisper("he")).toBe("he-IL");
    expect(bcp47FromWhisper("iw")).toBe("he-IL");
    expect(bcp47FromWhisper("EN")).toBe("en-US");
    expect(bcp47FromWhisper("xx")).toBeUndefined();
    expect(bcp47FromWhisper(undefined)).toBeUndefined();
  });
});
