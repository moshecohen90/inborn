import { downloadPercent, goodLanguagesOf, languageRank, languageTierOf, requiredFreeBytes, type CatalogModel, type DeliverySource, type InstallState } from "@inborn/core";

/** What the step can honestly say about one model right now. A model with no way in at all never becomes an option. */
export type OptionState =
  | { kind: "ready"; via: DeliverySource }
  | { kind: "arriving"; via: DeliverySource; percent: number; verifying: boolean }
  | { kind: "download"; via: DeliverySource; host?: string; bytes: number }
  | { kind: "no-space"; via: DeliverySource; freeUpBytes: number }
  | { kind: "failed"; via: DeliverySource };

export interface ModelOption {
  id: string;
  bytes: number;
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
}

export interface ModelStep {
  options: ModelOption[];
  /** The option selected when the screen opens: what is usable now, else what this device is meant to run. */
  initialSelection: string | null;
  /** At least one option is usable this second, so "Start chatting" is not a lie. */
  usableNow: boolean;
  /** The Wi-Fi switch only where it governs a download this screen can start: Play and the browser ignore the app's preference. */
  showWifiOnly: boolean;
  /** Android delivers through Play precisely because the app has no internet permission; the line is part of the claim. */
  showPlayNotice: boolean;
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
    const optionState = stateOf(state, plan, freeBytes, model.bytes, model.id === input.engineModelId);
    if (!optionState) continue;
    options.push({
      id: model.id,
      bytes: model.bytes,
      state: optionState,
      recommended: input.recommendedId === model.id,
      languages: model.fit ? goodLanguagesOf(model.fit) : [...model.goodLanguages],
      betterInLanguage: betterIn(model, smallest, input.languageCode),
    });
  }
  const usable = options.filter((o) => o.state.kind === "ready");
  const initial = usable.find((o) => o.recommended) ?? usable[0] ?? options.find((o) => o.recommended) ?? options[0] ?? null;
  return {
    options,
    initialSelection: initial?.id ?? null,
    usableNow: usable.length > 0,
    showWifiOnly: platform !== "web" && options.some((o) => o.state.kind === "download" && (o.state.via === "https" || o.state.via === "hf")),
    showPlayNotice: platform === "android" && options.some((o) => o.state.kind !== "ready" && o.state.via === "play"),
  };
}

function stateOf(state: InstallState, plan: StepEntry["plan"], freeBytes: number, bytes: number, loadedByEngine: boolean): OptionState | null {
  if (INSTALLED.includes(state.kind) && "via" in state) return { kind: "ready", via: state.via };
  if (state.kind === "delivering") return { kind: "arriving", via: state.via, percent: downloadPercent(state.bytes, state.total), verifying: false };
  if (state.kind === "verifying") return { kind: "arriving", via: state.via, percent: 100, verifying: true };
  if (loadedByEngine) return { kind: "ready", via: "import" };
  if (!plan) return null;
  if (state.kind === "failed") return { kind: "failed", via: plan.via };
  const required = requiredFreeBytes(bytes);
  if (state.kind === "needs-space" || freeBytes < required) return { kind: "no-space", via: plan.via, freeUpBytes: required - freeBytes };
  return { kind: "download", via: plan.via, bytes, ...(plan.host ? { host: plan.host } : {}) };
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
export function sourceKey(state: OptionState): string {
  if (state.kind === "ready") return state.via === "bundled" ? "onboarding.model.source.bundled" : "onboarding.model.source.ready";
  if (state.kind === "arriving" && state.via === "play") return "onboarding.model.source.playPending";
  return state.via === "play" ? "onboarding.model.source.play" : "onboarding.model.source.https";
}
