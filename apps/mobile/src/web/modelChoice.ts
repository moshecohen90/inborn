import { BUNDLED_MANIFEST, expectedSpeed, goodLanguagesOf, rankModels, type CatalogModel, type DeviceProfile, type SpeedRange, type UseCase } from "@inborn/core";
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
