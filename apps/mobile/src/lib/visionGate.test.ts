import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planVisionTurn, type VisionTurnInput } from "./visionGate";

const ready: VisionTurnInput = {
  hasImages: true,
  vaultScanned: true,
  modelSees: true,
  projectorInstalled: true,
  projectorAttached: true,
  onLastUserMessage: true,
  otherModelSees: true,
};
const plan = (o: Partial<VisionTurnInput>) => planVisionTurn({ ...ready, ...o });

/**
 * F294. On the iPhone the first photo after a cold launch answered *"I can't see the photo… I don't have visual
 * capabilities."*: the vault had not finished scanning, the 205 MB projector read as absent, and the turn went to the
 * model anyway. A picture now waits for its projector, exactly like an attached document waits to be read.
 */
describe("F294 · a picture waits for its projector instead of being answered around", () => {
  it("a cold launch waits: before the vault scan, no answer about the picture is honest", () => {
    expect(plan({ vaultScanned: false, projectorAttached: false, projectorInstalled: false })).toEqual({ kind: "wait" });
    /* The complement: the same state once the disk has been read is a refusal, not a wait. */
    expect(plan({ vaultScanned: true, projectorAttached: false, projectorInstalled: false, modelSees: true })).toEqual({ kind: "refuse", offer: "companion" });
  });

  it("an installed but unattached projector waits, it is not skipped", () => {
    expect(plan({ projectorAttached: false, projectorInstalled: true })).toEqual({ kind: "wait" });
  });

  it("sends only once the projector is attached", () => {
    expect(plan({})).toEqual({ kind: "send" });
    expect(plan({ hasImages: false, projectorAttached: false, vaultScanned: false })).toEqual({ kind: "send" });
  });

  it("offers the model that can see when this one cannot, and the companion when none can", () => {
    expect(plan({ modelSees: false, projectorAttached: false, projectorInstalled: true, otherModelSees: true })).toEqual({ kind: "refuse", offer: "switch" });
    expect(plan({ modelSees: false, projectorAttached: false, projectorInstalled: false, otherModelSees: false })).toEqual({ kind: "refuse", offer: "companion" });
  });

  it("drops the pictures of older turns instead of refusing this one", () => {
    expect(plan({ onLastUserMessage: false, projectorAttached: false, projectorInstalled: false, modelSees: false })).toEqual({ kind: "drop" });
  });

  it("never sends a picture the model cannot see: no input at all gives `send` unless it is attached", () => {
    const bool = [true, false];
    for (const vaultScanned of bool) {
      for (const modelSees of bool) {
        for (const projectorInstalled of bool) {
          for (const onLastUserMessage of bool) {
            for (const otherModelSees of bool) {
              const verdict = planVisionTurn({ hasImages: true, projectorAttached: false, vaultScanned, modelSees, projectorInstalled, onLastUserMessage, otherModelSees });
              expect(verdict.kind, JSON.stringify({ vaultScanned, modelSees, projectorInstalled, onLastUserMessage, otherModelSees })).not.toBe("send");
            }
          }
        }
      }
    }
  });

  it("the chat screen holds the turn behind the notice, and the notice has a line in every locale", () => {
    const repo = join(__dirname, "../../../..");
    const chat = readFileSync(join(__dirname, "../screens/Chat.tsx"), "utf8");
    expect(chat).toContain("let turnVision = plan();");
    expect(chat).toContain("await visionScanned();");
    expect(chat).toContain('testID="preparing-vision"');
    expect(chat).toContain('t("chat.vision.preparing")');
    for (const loc of ["en", "de", "fr", "es", "pt-BR", "ja", "ko", "zh-Hant", "pseudo"]) {
      const json = JSON.parse(readFileSync(join(repo, `packages/i18n/locales/${loc}.json`), "utf8")) as Record<string, string>;
      expect(json["chat.vision.preparing"], loc).toBeTruthy();
    }
  });
});
