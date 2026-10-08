import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, NOT_INSTALLED, type CatalogModel, type DeliverySource, type InstallState } from "@inborn/core";
import { languagesLine, modelStep, sourceKey, type ModelStepInput, type StepEntry } from "./modelStep";

const model = (id: string): CatalogModel => BUNDLED_MANIFEST.models.find((m) => m.id === id)!;
const instant = model("instant");
const fast = model("fast");
const sharp = model("sharp");

const ready = (via: DeliverySource): InstallState => ({ kind: "ready", path: "file:///x.gguf", bytes: 1, sha256: "", via });
const entry = (m: CatalogModel, state: InstallState, plan: StepEntry["plan"]): StepEntry => ({ model: m, state, plan });
const playPlan = (m: CatalogModel) => ({ via: "play" as const, bytes: m.bytes });
const httpsPlan = (m: CatalogModel) => ({ via: "https" as const, host: "models.inbornapp.com", bytes: m.bytes });

const step = (patch: Partial<ModelStepInput>) =>
  modelStep({ platform: "ios", entries: [], freeBytes: 20e9, ramGB: 8, languageCode: "en", pro: false, ...patch });

describe("model step offers", () => {
  it("iOS: Instant is bundled and Fast is one download, so both are real choices before anything moves", () => {
    const s = step({
      platform: "ios",
      entries: [entry(instant, ready("bundled"), httpsPlan(instant)), entry(fast, NOT_INSTALLED, httpsPlan(fast))],
      recommendedId: "fast",
    });
    expect(s.options.map((o) => o.id)).toEqual(["instant", "fast"]);
    expect(s.options[0]!.state).toEqual({ kind: "ready", via: "bundled" });
    expect(s.options[1]!.state).toEqual({ kind: "download", via: "https", host: "models.inbornapp.com", bytes: fast.bytes });
    expect(s.usableNow).toBe(true);
    expect(s.initialSelection).toBe("fast");
    expect(s.startNowWith).toBe("instant");
    expect(s.showWifiOnly).toBe(true);
    expect(s.showPlayNotice).toBe(false);
  });

  it("Android: Play delivers both, so the Play line is shown and the Wi-Fi switch is not (Play asks for itself)", () => {
    const s = step({
      platform: "android",
      entries: [entry(instant, ready("play"), playPlan(instant)), entry(fast, NOT_INSTALLED, playPlan(fast))],
    });
    expect(s.options[1]!.state).toEqual({ kind: "download", via: "play", bytes: fast.bytes });
    expect(s.showPlayNotice).toBe(true);
    expect(s.showWifiOnly).toBe(false);
  });

  it("Android before the fast-follow pack lands: Instant is still an option, and nothing claims to be usable yet", () => {
    const s = step({ platform: "android", entries: [entry(instant, NOT_INSTALLED, playPlan(instant)), entry(fast, NOT_INSTALLED, playPlan(fast))] });
    expect(s.usableNow).toBe(false);
    expect(s.initialSelection).toBe("instant");
    expect(s.options.map((o) => o.state.kind)).toEqual(["download", "download"]);
  });

  it("web: the browser keeps its model outside the vault, and offers nothing it cannot download (F120)", () => {
    const s = step({
      platform: "web",
      entries: [entry(instant, NOT_INSTALLED, null), entry(fast, NOT_INSTALLED, null)],
      engineModelId: "instant",
    });
    expect(s.options.map((o) => o.id)).toEqual(["instant"]);
    expect(s.options[0]!.state.kind).toBe("ready");
    expect(s.usableNow).toBe(true);
    expect(s.showWifiOnly).toBe(false);
    expect(s.showPlayNotice).toBe(false);
  });

  it("a model with no delivery and no copy is dropped, never shown as a dead offer", () => {
    const s = step({ platform: "web", entries: [entry(instant, ready("import"), null), entry(fast, NOT_INSTALLED, null)] });
    expect(s.options.map((o) => o.id)).toEqual(["instant"]);
  });

  it("a device below the model's RAM floor is never offered it", () => {
    const s = step({ ramGB: 4, entries: [entry(instant, ready("bundled"), httpsPlan(instant)), entry(fast, NOT_INSTALLED, httpsPlan(fast))] });
    expect(s.options.map((o) => o.id)).toEqual(["instant"]);
  });

  it("a Pro-only model stays out of the free onboarding and comes back for a Pro device", () => {
    const entries = [entry(instant, ready("bundled"), httpsPlan(instant)), entry(sharp, NOT_INSTALLED, httpsPlan(sharp))];
    expect(step({ entries }).options.map((o) => o.id)).toEqual(["instant"]);
    expect(step({ entries, pro: true }).options.map((o) => o.id)).toEqual(["instant", "sharp"]);
  });

  it("no room on disk: the option says what to free up instead of starting a download that cannot finish", () => {
    const s = step({ entries: [entry(instant, ready("bundled"), httpsPlan(instant)), entry(fast, NOT_INSTALLED, httpsPlan(fast))], freeBytes: 1e9 });
    const offer = s.options[1]!.state;
    expect(offer.kind).toBe("no-space");
    expect(offer.kind === "no-space" && offer.freeUpBytes).toBeGreaterThan(0);
    expect(s.showWifiOnly).toBe(false);
  });

  it("the source line keeps its host while the download waits for room, after it fails, and while it runs (round 131)", () => {
    const host = (state: InstallState, freeBytes = 20e9) => {
      const o = step({ entries: [entry(fast, state, httpsPlan(fast))], freeBytes }).options[0]!.state;
      return "host" in o ? o.host : undefined;
    };
    expect(host(NOT_INSTALLED, 1e9)).toBe("models.inbornapp.com");
    expect(host({ kind: "failed", error: "network", via: "https", retryable: true })).toBe("models.inbornapp.com");
    expect(host({ kind: "delivering", via: "https", bytes: 0, total: 1.2e9, paused: false, waitingForWifi: true, needsConfirmation: false })).toBe("models.inbornapp.com");
  });

  it("a download in flight reports its own progress and then the verify", () => {
    const delivering: InstallState = { kind: "delivering", via: "https", bytes: 600e6, total: 1.2e9, paused: false, waitingForWifi: false, needsConfirmation: false };
    expect(step({ entries: [entry(fast, delivering, httpsPlan(fast))] }).options[0]!.state).toEqual({ kind: "arriving", via: "https", host: "models.inbornapp.com", percent: 50, verifying: false });
    expect(step({ entries: [entry(fast, { kind: "verifying", via: "play", bytes: 1 }, playPlan(fast))] }).options[0]!.state).toEqual({ kind: "arriving", via: "play", percent: 100, verifying: true });
  });

  it("compares languages against the smallest chat model, not against the speech or embedding files (F120b)", () => {
    const speech = model("speech-whisper-base");
    const embed = model("embed-e5");
    const s = step({
      entries: [entry(speech, NOT_INSTALLED, httpsPlan(speech)), entry(embed, NOT_INSTALLED, httpsPlan(embed)), entry(instant, ready("bundled"), httpsPlan(instant))],
      languageCode: "en",
    });
    expect(s.options.map((o) => o.id)).toEqual(["instant"]);
    expect(s.options[0]!.betterInLanguage).toBe(null);
  });

  it("names the bigger model as better in the reader's own language, and says nothing where it is not", () => {
    const entries = [entry(instant, ready("bundled"), httpsPlan(instant)), entry(fast, NOT_INSTALLED, httpsPlan(fast))];
    expect(step({ entries, languageCode: "es" }).options[1]!.betterInLanguage).toBe("es");
    expect(step({ entries, languageCode: "en" }).options[1]!.betterInLanguage).toBe(null);
    expect(step({ entries, languageCode: "de" }).options[1]!.betterInLanguage).toBe(null);
    expect(step({ entries, languageCode: "es" }).options[0]!.betterInLanguage).toBe(null);
  });
});

describe("the option the step opens on", () => {
  const bundled = entry(instant, ready("bundled"), httpsPlan(instant));

  it("opens on the recommended download, with the ready model one tap away under it", () => {
    const s = step({ entries: [bundled, entry(fast, NOT_INSTALLED, httpsPlan(fast))], recommendedId: "fast" });
    expect(s.initialSelection).toBe("fast");
    expect(s.startNowWith).toBe("instant");
    expect(s.usableNow).toBe(true);
  });

  it("Android with nothing landed yet: opens on the smallest download (Instant) even when Fast is recommended, and offers no ready model it does not have", () => {
    const s = step({ platform: "android", entries: [entry(instant, NOT_INSTALLED, playPlan(instant)), entry(fast, NOT_INSTALLED, playPlan(fast))], recommendedId: "fast" });
    expect(s.initialSelection).toBe("instant");
    expect(s.options.find((o) => o.id === "fast")!.recommended).toBe(true);
    expect(s.startNowWith).toBe(null);
  });

  it("Android: a download already started on the step stays selected, whichever model it is", () => {
    const delivering: InstallState = { kind: "delivering", via: "play", bytes: 1, total: fast.bytes, paused: false, waitingForWifi: false, needsConfirmation: false };
    const s = step({ platform: "android", entries: [entry(instant, NOT_INSTALLED, playPlan(instant)), entry(fast, delivering, playPlan(fast))] });
    expect(s.initialSelection).toBe("fast");
  });

  it("a recommendation already here or arriving is selected, with no second way to start", () => {
    const delivering: InstallState = { kind: "delivering", via: "https", bytes: 600e6, total: 1.2e9, paused: false, waitingForWifi: false, needsConfirmation: false };
    for (const state of [ready("https"), delivering]) {
      const s = step({ entries: [bundled, entry(fast, state, httpsPlan(fast))], recommendedId: "fast" });
      expect(s.initialSelection).toBe("fast");
      expect(s.startNowWith).toBe(null);
    }
  });

  it("a recommendation that cannot be downloaded now leaves the step on what works", () => {
    const noSpace = step({ entries: [bundled, entry(fast, NOT_INSTALLED, httpsPlan(fast))], recommendedId: "fast", freeBytes: 1e9 });
    const failed = step({ entries: [bundled, entry(fast, { kind: "failed", error: "network", via: "https", retryable: true }, httpsPlan(fast))], recommendedId: "fast" });
    const noDelivery = step({ entries: [bundled, entry(fast, NOT_INSTALLED, null)], recommendedId: "fast" });
    const none = step({ entries: [bundled, entry(fast, NOT_INSTALLED, httpsPlan(fast))] });
    for (const s of [noSpace, failed, noDelivery, none]) {
      expect(s.initialSelection).toBe("instant");
      expect(s.startNowWith).toBe(null);
    }
  });

  it("only one option: it is selected, and nothing is offered beside it", () => {
    const s = step({ entries: [bundled], recommendedId: "instant" });
    expect(s.initialSelection).toBe("instant");
    expect(s.startNowWith).toBe(null);
  });
});

describe("card lines", () => {
  it("reads the source off the delivery, so iOS never claims Play and Android never claims a download of its own", () => {
    expect(sourceKey({ kind: "ready", via: "bundled" })).toBe("onboarding.model.source.bundled");
    expect(sourceKey({ kind: "ready", via: "play" })).toBe("onboarding.model.source.ready");
    expect(sourceKey({ kind: "ready", via: "import" })).toBe("onboarding.model.source.ready");
    expect(sourceKey({ kind: "download", via: "play", bytes: 1 })).toBe("onboarding.model.source.play");
    expect(sourceKey({ kind: "download", via: "https", bytes: 1 })).toBe("onboarding.model.source.https");
    expect(sourceKey({ kind: "arriving", via: "play", percent: 3, verifying: false })).toBe("onboarding.model.source.playPending");
  });

  it("truncates the languages line and counts what it left out", () => {
    expect(languagesLine(["en", "zh", "pt"])).toEqual({ list: ["en", "zh", "pt"], more: 0 });
    expect(languagesLine(["en", "zh", "es", "fr", "pt", "it"])).toEqual({ list: ["en", "zh", "es", "fr"], more: 2 });
  });
});

describe("Android · Instant and its photo pack are one download", () => {
  const vision = model("vision-qwen35");
  const photos = (state: InstallState) => (id: string) => (id === "instant" ? { bytes: vision.bytes, state } : null);
  const entries = [entry(instant, NOT_INSTALLED, playPlan(instant)), entry(fast, NOT_INSTALLED, playPlan(fast))];

  it("Instant's card and button carry Instant plus its projector; Fast carries Fast alone", () => {
    const s = step({ platform: "android", entries, photos: photos(NOT_INSTALLED) });
    const [i, f] = s.options;
    expect(i).toMatchObject({ id: "instant", bytes: instant.bytes + vision.bytes, withPhotos: true });
    expect(i!.state).toEqual({ kind: "download", via: "play", bytes: instant.bytes + vision.bytes });
    expect(f).toMatchObject({ id: "fast", bytes: fast.bytes, withPhotos: false });
    expect(sourceKey(i!.state, i!.withPhotos)).toBe("onboarding.model.source.playPhotos");
    expect(sourceKey(f!.state, f!.withPhotos)).toBe("onboarding.model.source.play");
  });

  it("a projector already here adds nothing to Instant's size", () => {
    const s = step({ platform: "android", entries, photos: photos(ready("play")) });
    expect(s.options[0]).toMatchObject({ bytes: instant.bytes, withPhotos: false });
  });

  it("one bar for both while they arrive, and it never goes back when the projector lands first", () => {
    const arriving = (bytes: number): InstallState => ({ kind: "delivering", via: "play", bytes, total: instant.bytes, paused: false, waitingForWifi: false, needsConfirmation: false });
    const half = (b: number) => Math.floor(b / 2);
    const both = step({ platform: "android", entries: [entry(instant, arriving(half(instant.bytes)), playPlan(instant))], photos: photos(arriving(half(vision.bytes))) });
    const landed = step({ platform: "android", entries: [entry(instant, arriving(half(instant.bytes)), playPlan(instant))], photos: photos(ready("play")) });
    const p1 = both.options[0]!.state.kind === "arriving" ? both.options[0]!.state.percent : -1;
    const p2 = landed.options[0]!.state.kind === "arriving" ? landed.options[0]!.state.percent : -1;
    expect(p1).toBe(50);
    expect(p2).toBeGreaterThan(p1);
  });

  it("the Wi-Fi hint shows wherever a Play download can start from the step, and nowhere else", () => {
    expect(step({ platform: "android", entries }).showPlayWifiHint).toBe(true);
    expect(step({ platform: "android", entries: [entry(instant, ready("play"), playPlan(instant))] }).showPlayWifiHint).toBe(false);
    expect(step({ platform: "ios", entries: [entry(instant, ready("bundled"), httpsPlan(instant)), entry(fast, NOT_INSTALLED, httpsPlan(fast))] }).showPlayWifiHint).toBe(false);
  });
});
