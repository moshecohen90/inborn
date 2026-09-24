import { BUNDLED_MANIFEST, betterForLanguage, expectedSpeed, goodLanguagesOf, modelChoices, rankModels, recommendationIsWeak, type CatalogModel, type DeviceProfile, type LanguageUpgrade, type ModelChoice, type ModelChoices, type SpeedRange, type UseCase } from "@inborn/core";
import { tierFits, type DeviceGate } from "./deviceGate";
import type { WebModelSource } from "./modelDelivery";

/** One model the browser can install, with everything a card says about it on THIS device. */
export interface WebModelChoice {
  source: WebModelSource;
  /** The catalog entry behind the manifest row; null for a served file the catalog does not describe (a dev alias). */
  model: CatalogModel | null;
  recommended: boolean;
  /** Verified in this browser's storage right now. */
  installed: boolean;
  /** Measured range for this tier in a browser (§6.4); undefined when nobody measured it, and then the card says so. */
  speed: SpeedRange | undefined;
  /** Codes the catalog rates native or good. */
  languages: string[];
}

/**
 * RAM the profile assumes when the browser will not say (Safari and Firefox ship no `deviceMemory`). The strip already
 * tells that reader "starting with the smaller models", so the assumption has to match it: a machine with many cores is
 * not a 4 GB one, and 6 GB is the §6.3 floor at which Fast becomes a recommendation instead of a merely-listed option.
 */
export const RAM_WHEN_UNKNOWN_GB = 4;
export const RAM_WHEN_UNKNOWN_MANY_CORES_GB = 6;
export const MANY_CORES = 8;

/** The §6.3 device profile as the browser can read it: what it reports, or the conservative reading of what it hides. */
export function webDeviceProfile(gate: DeviceGate): DeviceProfile {
  const deviceClass = gate.formFactor === "phone" ? "phone" : gate.formFactor === "tablet" ? "tablet" : "desktop";
  const ramGB = gate.ramGB ?? ((gate.cores ?? 0) >= MANY_CORES ? RAM_WHEN_UNKNOWN_MANY_CORES_GB : RAM_WHEN_UNKNOWN_GB);
  return { ramGB, deviceClass, chip: "web" };
}

export interface WebChoicesInput {
  sources: readonly WebModelSource[];
  gate: DeviceGate;
  /** Ids already verified in OPFS; a badge on the card, never a term in the ranking. */
  installed?: readonly string[];
  /** What the reader writes, for the language half of the §7.8 ranking; the app language before there is a chat. */
  languageCode?: string | null;
  use?: UseCase;
  catalog?: readonly CatalogModel[];
}

/**
 * Every model this browser can install, best first (§7.8 through `rankModels`, §14.3 through the gate). The door,
 * the vault and the onboarding step read this one list, so they cannot disagree about what is on offer or which one
 * is recommended here.
 */
export function webModelChoices({ sources, gate, installed = [], languageCode = null, use = "chat", catalog = BUNDLED_MANIFEST.models }: WebChoicesInput): WebModelChoice[] {
  const eligible = sources.filter((s) => tierFits(s.tier, gate.maxTier));
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const device = webDeviceProfile(gate);
  /* `installed: []` on purpose: RECOMMENDED has to mean "best for this device", not "the file you already took". */
  const ranked = rankModels({
    use,
    languageCode,
    device,
    installed: [],
    catalog: eligible.map((s) => byId.get(s.id)).filter((m): m is CatalogModel => !!m),
  });
  const rank = new Map(ranked.map((r, i) => [r.model.id, i]));
  /* A model the §6.3 ranking dropped (too little RAM for its floor) is still installable here, so it stays on the
     list, after everything that fits — never as the recommendation. */
  const order = (s: WebModelSource): number => rank.get(s.id) ?? ranked.length + eligible.indexOf(s);
  const sorted = [...eligible].sort((a, b) => order(a) - order(b));
  /* The smallest file is the fallback recommendation: a browser the ranking has nothing to say about still gets an offer. */
  const recommendedId = ranked[0]?.model.id ?? [...eligible].sort((a, b) => a.bytes - b.bytes)[0]?.id;
  return sorted.map((source) => {
    const model = byId.get(source.id) ?? null;
    return {
      source,
      model,
      recommended: source.id === recommendedId,
      installed: installed.includes(source.id),
      speed: expectedSpeed(device.chip ?? "web", source.tier),
      languages: model?.fit ? goodLanguagesOf(model.fit) : [...(model?.goodLanguages ?? [])],
    };
  });
}

export const recommendedChoice = (choices: readonly WebModelChoice[]): WebModelChoice | null => choices.find((c) => c.recommended) ?? choices[0] ?? null;

/** The source the browser should load: the one the reader chose and can still run, else the recommendation. */
export function chosenSource(choices: readonly WebModelChoice[], chosenId: string | null): WebModelSource | null {
  const chosen = chosenId ? choices.find((c) => c.source.id === chosenId) : undefined;
  return (chosen ?? recommendedChoice(choices))?.source ?? null;
}

const unblocked = ({ blocked: _blocked, ...row }: ModelChoice): ModelChoice => row;

export interface WebSheetInput {
  /** `WebBoot.choices`: what the door offers on this browser. */
  choices: readonly WebModelChoice[];
  gate: DeviceGate;
  use: UseCase;
  languageCode: string | null;
  /** The model the page has loaded. */
  currentId: string | null;
  catalog?: readonly CatalogModel[];
}

export interface WebSheetChoices extends ModelChoices {
  /** Catalog models this browser is never offered (Pro, split files, above the gate): listed under "In the app", no action. */
  inTheApp: ModelChoice[];
}

/**
 * The chat's Model sheet on the browser tier, ranked by `webModelChoices` for this chat's task and language: in an
 * ordinary chat it names the same RECOMMENDED as the door and the vault, and every model the door offers is a
 * choice here too, never "In the app".
 */
export function webSheetChoices({ choices, gate, use, languageCode, currentId, catalog = BUNDLED_MANIFEST.models }: WebSheetInput): WebSheetChoices {
  const installed = choices.filter((c) => c.installed || c.source.id === currentId).map((c) => c.source.id);
  const ranked = webModelChoices({ sources: choices.map((c) => c.source), gate, installed, languageCode, use, catalog });
  const all = modelChoices({ use, languageCode, device: webDeviceProfile(gate), installed, currentId, catalog });
  const rows = new Map([...all.installed, ...all.available, ...all.unavailable].map((c) => [c.model.id, c]));
  /* The gate already decided these run here; a RAM floor the ranking applies only moves them down, as at the door. */
  const offered = ranked.flatMap((c): ModelChoice[] => {
    const row = rows.get(c.source.id);
    return row ? [unblocked(row)] : [];
  });
  const here = new Set(offered.map((c) => c.model.id));
  const top = ranked.find((c) => c.recommended);
  const topRow = top ? offered.find((c) => c.model.id === top.source.id) : undefined;
  const recommended = topRow ? { model: topRow.model, reason: topRow.reason } : null;
  return {
    installed: offered.filter((c) => c.installed),
    available: offered.filter((c) => !c.installed),
    unavailable: [],
    /* Not "too big for N GB": the browser's reading is a guess, and the app on this same device may well run them. */
    inTheApp: [...all.installed, ...all.available, ...all.unavailable].filter((c) => !here.has(c.model.id)).map(unblocked),
    recommended,
    recommendedWeak: !!recommended && recommendationIsWeak(recommended),
  };
}

/**
 * The chat's weak-language notice on the browser tier: `betterForLanguage` over what this browser offers, so it names
 * Fast for a Spanish chat on Instant instead of claiming nothing here is good at Spanish. Null when nothing offered does better.
 */
export function webLanguageUpgrade({ choices, gate, use, languageCode, currentId, catalog = BUNDLED_MANIFEST.models }: WebSheetInput): LanguageUpgrade | null {
  if (!languageCode || !currentId) return null;
  const offered = new Set(choices.map((c) => c.source.id));
  const installed = choices.filter((c) => c.installed || c.source.id === currentId).map((c) => c.source.id);
  return betterForLanguage({ current: catalog.find((m) => m.id === currentId), use, languageCode, device: webDeviceProfile(gate), installed, catalog: catalog.filter((m) => offered.has(m.id)) });
}
