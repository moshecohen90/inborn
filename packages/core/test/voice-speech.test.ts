import { describe, expect, it } from "vitest";
import { chooseDictation, normalizeLocale, pickVoice, shouldRetryDictationStart, speechChunks, speechLanguage } from "../src/voice/speech";
import { buildPrompt } from "../src/chat/context";
import { limits } from "../src/licence/gates";

describe("chooseDictation", () => {
  const base = { systemAvailable: true, systemOnDevice: true, whisperReady: false } as const;
  it("free uses the system engine only when it runs on the device", () => {
    expect(chooseDictation({ tier: "free", ...base })).toEqual({ engine: "system" });
    expect(chooseDictation({ tier: "free", ...base, systemOnDevice: false })).toEqual({ engine: null, reason: "system-offline-missing" });
    expect(chooseDictation({ tier: "free", ...base, systemAvailable: false, systemOnDevice: false })).toEqual({ engine: null, reason: "unsupported-platform" });
  });
  it("free never gets whisper even when the file is there", () => {
    expect(chooseDictation({ tier: "free", ...base, systemOnDevice: false, whisperReady: true })).toEqual({ engine: null, reason: "system-offline-missing" });
  });
  it("pro falls back to whisper, or asks to install it", () => {
    expect(chooseDictation({ tier: "pro", ...base, systemOnDevice: false, whisperReady: true })).toEqual({ engine: "whisper" });
    expect(chooseDictation({ tier: "pro", ...base, systemOnDevice: false })).toEqual({ engine: null, reason: "whisper-not-installed" });
    expect(chooseDictation({ tier: "pro", ...base, systemAvailable: false, systemOnDevice: false, whisperReady: true })).toEqual({ engine: "whisper" });
  });
  it("pro can prefer whisper over a working system engine (unsupported language)", () => {
    expect(chooseDictation({ tier: "pro", ...base, whisperReady: true, preferWhisper: true })).toEqual({ engine: "whisper" });
    expect(chooseDictation({ tier: "pro", ...base, whisperReady: false, preferWhisper: true })).toEqual({ engine: "system" });
  });
});

describe("speechLanguage / normalizeLocale", () => {
  it("follows the script and falls back to the UI locale for Latin", () => {
    expect(speechLanguage("שלום עולם", "en-US")).toBe("he-IL");
    expect(speechLanguage("مرحبا", "en")).toBe("ar-SA");
    expect(speechLanguage("Привет", "de")).toBe("ru-RU");
    expect(speechLanguage("こんにちは", "en")).toBe("ja-JP");
    expect(speechLanguage("Bonjour", "fr")).toBe("fr-FR");
    expect(speechLanguage("Hello", "pt-BR")).toBe("pt-BR");
  });
  it("normalizes underscores, cases and bare languages", () => {
    expect(normalizeLocale("pt_br")).toBe("pt-BR");
    expect(normalizeLocale("de")).toBe("de-DE");
    expect(normalizeLocale("xx")).toBe("xx");
    expect(normalizeLocale("")).toBe("en-US");
  });
});

describe("pickVoice", () => {
  const voices = [
    { identifier: "net-he", language: "he-IL", local: false },
    { identifier: "he-default", language: "he_IL", quality: "Default" },
    { identifier: "he-enh", language: "he-IL", quality: "Enhanced" },
    { identifier: "en-gb", language: "en-GB" },
    { identifier: "en-us-net", language: "en-US", quality: "network" },
  ];
  it("prefers an exact local enhanced voice and never a network one", () => {
    expect(pickVoice(voices, "he-IL")?.identifier).toBe("he-enh");
    expect(pickVoice(voices, "en-US")?.identifier).toBe("en-gb");
    expect(pickVoice(voices, "fr-FR")).toBeUndefined();
  });
});

describe("speechChunks", () => {
  it("splits on sentence ends and keeps Hebrew / CJK punctuation", () => {
    expect(speechChunks("One. Two! Three? 四。")).toEqual(["One.", "Two!", "Three?", "四。"]);
    expect(speechChunks("שלום. מה שלומך?")).toEqual(["שלום.", "מה שלומך?"]);
  });
  it("splits an endless sentence at clause boundaries near the cap", () => {
    const long = Array.from({ length: 30 }, (_, i) => `clause ${i}`).join(", ");
    const chunks = speechChunks(long, 80);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(80);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toContain("clause 29");
  });
  it("drops empties", () => {
    expect(speechChunks("  \n\n ")).toEqual([]);
  });
});

describe("images through the licence limits and the prompt builder", () => {
  it("free gets one photo per message, pro unlimited", () => {
    expect(limits("free").imagesPerMessage).toBe(1);
    expect(limits("pro").imagesPerMessage).toBe(Infinity);
  });
  it("buildPrompt keeps the images of a kept message and never invents the field", () => {
    const b = buildPrompt({ system: "s", nCtx: 4096, messages: [{ id: "1", role: "user", content: "look", images: ["file:///a.jpg"] }, { id: "2", role: "assistant", content: "ok" }] });
    expect(b.messages[1]).toEqual({ role: "user", content: "look", images: ["file:///a.jpg"] });
    expect(b.messages[2]).toEqual({ role: "assistant", content: "ok" });
  });
});

describe("shouldRetryDictationStart", () => {
  it("retries once when the audio session was interrupted right after start", () => {
    expect(shouldRetryDictationStart({ code: "interrupted", afterMs: 207, attempt: 0 })).toBe(true);
    expect(shouldRetryDictationStart({ code: "interrupted", afterMs: 500, attempt: 0 })).toBe(true);
  });
  it("never retries a second time, a late interruption, or another error", () => {
    expect(shouldRetryDictationStart({ code: "interrupted", afterMs: 207, attempt: 1 })).toBe(false);
    expect(shouldRetryDictationStart({ code: "interrupted", afterMs: 1800, attempt: 0 })).toBe(false);
    expect(shouldRetryDictationStart({ code: "service-not-allowed", afterMs: 132, attempt: 0 })).toBe(false);
    expect(shouldRetryDictationStart({ code: "no-speech", afterMs: 100, attempt: 0 })).toBe(false);
  });
});
