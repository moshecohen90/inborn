import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gatePhotoSend, planPhotoSend, planVisionTurn, releasesHeldTurn, type PhotoSend, type VisionTurnInput } from "./visionGate";

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

/**
 * F343. On the iPhone (TestFlight 18) a photo with no vision pack became a message, the "needs the vision companion"
 * line was dismissed, and the model answered that it received no image. Send now holds the turn in the composer.
 */
describe("F343 · a photo nothing here can see is held in the composer, not sent", () => {
  const noPack = { hasImages: true, modelSees: true, projectorInstalled: false, otherModelSees: true };

  it("no pack on disk holds the send; the pack on disk lets it go", () => {
    expect(planPhotoSend(noPack)).toEqual({ kind: "hold", offer: "companion" });
    expect(planPhotoSend({ ...noPack, projectorInstalled: true })).toEqual({ kind: "send" });
    expect(planPhotoSend({ ...noPack, modelSees: false, projectorInstalled: true })).toEqual({ kind: "hold", offer: "switch" });
    expect(planPhotoSend({ ...noPack, hasImages: false })).toEqual({ kind: "send" });
  });

  const run = (verdicts: PhotoSend[]) => {
    const log: string[] = [];
    let n = 0;
    const deps = {
      hasImages: true,
      scanned: async () => void log.push("scan"),
      verdict: () => verdicts[Math.min(n++, verdicts.length - 1)]!,
      hold: (o: string) => void log.push(`hold:${o}`),
      send: async () => void log.push("send"),
    };
    return { log, deps };
  };

  it("refuse: nothing is sent, the turn is held; pressing Send again still holds; once the pack is in, it is sent", async () => {
    const { log, deps } = run([{ kind: "hold", offer: "companion" }, { kind: "hold", offer: "companion" }, { kind: "send" }]);
    expect(await gatePhotoSend(deps)).toBe("held");
    expect(log).toEqual(["scan", "hold:companion"]);
    expect(await gatePhotoSend(deps)).toBe("held");
    expect(log).not.toContain("send");
    expect(await gatePhotoSend(deps)).toBe("sent");
    expect(log.at(-1)).toBe("send");
  });

  it("the disk scan comes before the verdict, so a cold launch does not hold a photo the pack could read (F294)", async () => {
    const { log, deps } = run([{ kind: "send" }]);
    await gatePhotoSend(deps);
    expect(log).toEqual(["scan", "send"]);
  });

  it("the held turn is released only by the pack turning ready, never by anything else", () => {
    expect(releasesHeldTurn(true, "delivering", "ready")).toBe(true);
    expect(releasesHeldTurn(true, "verifying", "ready")).toBe(true);
    expect(releasesHeldTurn(true, "ready", "ready")).toBe(false);
    expect(releasesHeldTurn(false, "delivering", "ready")).toBe(false);
    expect(releasesHeldTurn(true, "not-installed", "delivering")).toBe(false);
    expect(releasesHeldTurn(true, "delivering", "failed")).toBe(false);
  });

  it("the chat keeps the message and the photo until the gate lets the turn go", () => {
    const chat = readFileSync(join(__dirname, "../screens/Chat.tsx"), "utf8");
    const submit = chat.slice(chat.indexOf("const submit = async (input: string) => {"), chat.indexOf("const submitNow = async"));
    expect(submit).toContain("await gatePhotoSend({");
    expect(submit).toContain("hold: setPhotoHold");
    expect(submit).not.toContain("setDraft(");
    expect(submit).not.toContain("setPendingImages(");
    expect(submit).not.toContain("appendMessage(");
    const now = chat.slice(chat.indexOf("const submitNow = async"));
    expect(now.indexOf('setDraft("")')).toBeGreaterThan(-1);
    expect(now.indexOf("setPendingImages([])")).toBeGreaterThan(now.indexOf('setDraft("")'));
    expect(chat).toContain("<VisionHoldCard");
    expect(chat).toContain("onReady={releaseHeldTurn}");
  });

  it("the card has its words in every locale, and none of them is jargon", () => {
    const repo = join(__dirname, "../../../..");
    const keys = ["holdTitle", "holdTitleModel", "holdBody", "holdSwitch", "holdDownloading", "holdStuck", "holdDownload", "holdRemove"].map((k) => `chat.vision.${k}`);
    for (const loc of ["en", "de", "fr", "es", "pt-BR", "ja", "ko", "zh-Hant", "pseudo"]) {
      const json = JSON.parse(readFileSync(join(repo, `packages/i18n/locales/${loc}.json`), "utf8")) as Record<string, string>;
      for (const k of keys) {
        expect(json[k], `${loc} ${k}`).toBeTruthy();
        expect(json[k]!.toLowerCase(), `${loc} ${k}`).not.toMatch(/companion|projector|mmproj|begleiter|compagnon|acompanhante/);
      }
    }
  });
});
