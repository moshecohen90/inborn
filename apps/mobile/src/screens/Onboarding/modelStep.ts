import { downloadPercent, goodLanguagesOf, languageRank, languageTierOf, requiredFreeBytes, type CatalogModel, type DeliverySource, type InstallState } from "@inborn/core";

/** What the step can honestly say about one model right now. A model with no way in at all never becomes an option. */
export type OptionState =
  | { kind: "ready"; via: DeliverySource }
  /** `waiting`: no bytes can move right now, for want of any connection or of Wi-Fi. */
  | { kind: "arriving"; via: DeliverySource; host?: string; percent: number; verifying: boolean; waiting?: "network" | "wifi" }
  | { kind: "download"; via: DeliverySource; host?: string; bytes: number }
  | { kind: "no-space"; via: DeliverySource; host?: string; freeUpBytes: number }
  | { kind: "failed"; via: DeliverySource; host?: string };

export interface ModelOption {
  id: string;
  /** What the download moves: the model plus the photo pack that comes with it, when that pack is not here yet. */
  bytes: number;
  /** The model's photo pack arrives with it as part of the same download (Instant's projector on Play). */
  withPhotos: boolean;
  state: OptionState;
  recommended: boolean;
  /** Language codes the catalog rates native or good, in catalog order. */
  languages: string[];
  /** Set when this model reads the user's own language better than the smallest option does. */
  betterInLanguage: string | null;
}

/** One entry of `VaultStore.entries()`, narrowed to what the step reads. */
export interface StepEntry {
  model: CatalogModel;
  state: InstallState;
  plan: { via: DeliverySource; host?: string; bytes: number } | null;
}

export interface ModelStepInput {
  platform: "ios" | "android" | "web";
  entries: readonly StepEntry[];
  /** `VaultStore.recommendedId()`: the tier this device is meant to run. */
  recommendedId?: string | undefined;
  /** A model the engine already holds that the vault cannot see: the browser keeps its copy in OPFS, not in the vault. */
  engineModelId?: string | null;
  freeBytes: number;
  ramGB: number | null;
  /** The app's current language, for the "better in your language" hint. */
  languageCode: string | null;
  pro: boolean;
  /** `VaultStore.photoPackOf`: the photo pack that downloads together with this model, with its state now. */
  photos?: (id: string) => { bytes: number; state: InstallState } | null;
}

export interface ModelStep {
  options: ModelOption[];
  /** The option selected when the screen opens: the recommended model when it can be downloaded now or is arriving, else what is usable now, else the recommendation. */
  initialSelection: string | null;
  /** A ready model to chat on instead, offered under the recommended download so nobody has to wait for it. */
  startNowWith: string | null;
  /** At least one option is usable this second, so "Start chatting" is not a lie. */
  usableNow: boolean;
  /** The Wi-Fi switch only where it governs a download this screen can start: Play and the browser ignore the app's preference. */
  showWifiOnly: boolean;
  /** Android delivers through Play precisely because the app has no internet permission; the line is part of the claim. */
  showPlayNotice: boolean;
  /** A Play download this screen can start: say Wi-Fi is best, and that Play asks before it uses mobile data. */
  showPlayWifiHint: boolean;
}

const INSTALLED: InstallState["kind"][] = ["ready", "quarantined"];

/**
 * S02: the choice, before a byte moves. A model is an option when it is already here or when this platform can start
 * its delivery from this screen; anything else (no Play, the browser vault, a model this RAM cannot hold) is not offered
 * at all, because the step has no way to honour it (QA F120).
 */
export function modelStep(input: ModelStepInput): ModelStep {
  const { platform, entries, freeBytes, ramGB, pro } = input;
  const options: ModelOption[] = [];
  const chat = entries.filter((e) => e.model.role === "chat" && (!e.model.proOnly || pro));
  /* The baseline of "better in your language" is the smallest CHAT model; an embedding or speech file is not a comparison. */
  const smallest = [...chat].sort((a, b) => a.model.bytes - b.model.bytes)[0]?.model;
  for (const { model, state, plan } of chat) {
    /* A model the device cannot hold is not a choice, it is a disappointment; the vault still lists it with the reason. */
    if (ramGB !== null && model.minRamGB > ramGB) continue;
    const photos = input.photos?.(model.id) ?? null;
    /* While the model still arrives, a photo pack that landed first stays in the size, or the card would shrink mid-download. */
    const photoBytes = photos && (!INSTALLED.includes(photos.state.kind) || (state.kind === "delivering" || state.kind === "verifying")) ? photos.bytes : 0;
    const bytes = model.bytes + photoBytes;
    const optionState = withPhotoProgress(stateOf(state, plan, freeBytes, bytes, model.id === input.engineModelId), state, model.bytes, photos);
    if (!optionState) continue;
    options.push({
      id: model.id,
      bytes,
      withPhotos: photoBytes > 0 || (optionState.kind === "arriving" && !!photos),
      state: optionState,
      recommended: input.recommendedId === model.id,
      languages: model.fit ? goodLanguagesOf(model.fit) : [...model.goodLanguages],
      betterInLanguage: betterIn(model, smallest, input.languageCode),
    });
  }
  const usable = options.filter((o) => o.state.kind === "ready");
  const offer = options.find((o) => o.recommended && o.state.kind === "download");
  /* Arriving too: the recommended download just started on this screen must stay selected, or its progress and cancel vanish. */
  const coming = offer ?? options.find((o) => o.recommended && o.state.kind === "arriving");
  /* Android with nothing here yet: the first download is the smallest one, so the first answer comes soonest. */
  const firstDownload = platform === "android" && !usable.length ? [...options].filter((o) => o.state.kind === "download").sort((a, b) => a.bytes - b.bytes)[0] : undefined;
  const arriving = options.find((o) => o.state.kind === "arriving");
  const initial = (platform === "android" && !usable.length ? (arriving ?? firstDownload) : undefined) ?? coming ?? usable.find((o) => o.recommended) ?? usable[0] ?? options.find((o) => o.recommended) ?? options[0] ?? null;
  return {
    options,
    initialSelection: initial?.id ?? null,
    startNowWith: offer ? (usable[0]?.id ?? null) : null,
    usableNow: usable.length > 0,
    showWifiOnly: platform !== "web" && options.some((o) => o.state.kind === "download" && (o.state.via === "https" || o.state.via === "hf")),
    showPlayNotice: platform === "android" && options.some((o) => o.state.kind !== "ready" && o.state.via === "play"),
    showPlayWifiHint: platform === "android" && options.some((o) => o.state.kind === "download" && o.state.via === "play"),
  };
}

/** One bar for the model and its photo pack while both arrive, so the bar never jumps back when the smaller one lands. */
function withPhotoProgress(option: OptionState | null, state: InstallState, modelBytes: number, photos: { bytes: number; state: InstallState } | null): OptionState | null {
  if (option?.kind !== "arriving" || option.verifying || state.kind !== "delivering" || !photos) return option;
  const p = photos.state;
  const photoDone = p.kind === "delivering" ? p.bytes : p.kind === "verifying" || (INSTALLED.includes(p.kind) && "via" in p && p.via === "play") ? photos.bytes : null;
  if (photoDone === null) return option;
  return { ...option, percent: downloadPercent(state.bytes + photoDone, modelBytes + photos.bytes) };
}

function stateOf(state: InstallState, plan: StepEntry["plan"], freeBytes: number, bytes: number, loadedByEngine: boolean): OptionState | null {
  if (INSTALLED.includes(state.kind) && "via" in state) return { kind: "ready", via: state.via };
  /* "one download from <host>" stays whole once the download is queued, waiting or failed (device pass 35). */
  const host = plan?.host ? { host: plan.host } : {};
  if (state.kind === "delivering") {
    const waiting = state.waitingForNetwork ? "network" : state.waitingForWifi ? "wifi" : null;
    return { kind: "arriving", via: state.via, ...host, percent: downloadPercent(state.bytes, state.total), verifying: false, ...(waiting ? { waiting } : {}) };
  }
  if (state.kind === "verifying") return { kind: "arriving", via: state.via, ...host, percent: 100, verifying: true };
  if (loadedByEngine) return { kind: "ready", via: "import" };
  if (!plan) return null;
  if (state.kind === "failed") return { kind: "failed", via: plan.via, ...host };
  const required = requiredFreeBytes(bytes);
  if (state.kind === "needs-space" || freeBytes < required) return { kind: "no-space", via: plan.via, ...host, freeUpBytes: required - freeBytes };
  return { kind: "download", via: plan.via, bytes, ...host };
}

/** The one comparison that decides a model for most people: does it read my language better than the small one? */
function betterIn(model: CatalogModel, smallest: CatalogModel | undefined, code: string | null): string | null {
  if (!code || !smallest || smallest.id === model.id) return null;
  const mine = languageRank(languageTierOf(model, code) ?? undefined);
  return mine > languageRank(languageTierOf(smallest, code) ?? undefined) && mine >= languageRank("good") ? code : null;
}

/** The languages line: the first `max` names as given, plus how many the line left out. */
export function languagesLine(names: readonly string[], max = 4): { list: string[]; more: number } {
  return { list: names.slice(0, max), more: Math.max(0, names.length - max) };
}

/** Which "where it comes from" line the card prints; the source is read off the delivery, never guessed from the platform. */
export function sourceKey(state: OptionState, withPhotos = false): string {
  if (state.kind === "ready") return state.via === "bundled" ? "onboarding.model.source.bundled" : "onboarding.model.source.ready";
  if (state.kind === "arriving" && state.via === "play") return "onboarding.model.source.playPending";
  if (state.via === "play") return withPhotos ? "onboarding.model.source.playPhotos" : "onboarding.model.source.play";
  return "onboarding.model.source.https";
}
