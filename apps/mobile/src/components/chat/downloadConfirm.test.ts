import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, findModel } from "@inborn/core";
import { CONFIRM_ABOVE_BYTES, needsConfirm } from "../../vault/intent";

const bytes = (id: string) => findModel(BUNDLED_MANIFEST, id)!.bytes;
const src = (name: string) => readFileSync(join(__dirname, name), "utf8");
const STARTS = /\b(installPath|installExtension|resumeExtension|installChatModel|installVision)\(/;

/* Founder, 11.10: one tap on a chat card put 1.95 GB (Fast + its photo pack) in front of Play's dialog. */
describe("a chat card never starts more than 200 MB on one tap", () => {
  it("asks for Fast with its photo pack, and for every photo pack, before a byte moves", () => {
    expect(CONFIRM_ABOVE_BYTES).toBe(200e6);
    expect(needsConfirm(bytes("fast") + bytes("vision-qwen35-2b"))).toBe(true);
    expect(needsConfirm(bytes("vision-qwen35"))).toBe(true);
    expect(needsConfirm(bytes("speech-whisper-base"))).toBe(false);
  });

  it("every card that starts a download does it only inside the confirm sheet's callback", () => {
    const cards = readdirSync(__dirname).filter((f) => f.endsWith(".tsx") && STARTS.test(src(f)));
    expect(cards.sort()).toEqual(["ExtensionHoldCard.tsx", "PhotoHoldCard.tsx"]);
    for (const card of cards) {
      const text = src(card);
      expect(text, card).toContain("<DownloadConfirm pending={pending}");
      const lines = text.split("\n");
      for (const [i, line] of lines.entries()) {
        if (!STARTS.test(line) || /^\s*import /.test(line)) continue;
        const context = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        expect(context, `${card}:${i + 1}`).toMatch(/confirmed\(/);
      }
    }
  });
});
