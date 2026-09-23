import { languageRank, languageTierOf, useRank, useTierOf } from "./fit";
import { TIER_ORDER, defaultTier, maxTier, ramFit, type DeviceProfile, type RamFit } from "./pick";
import { tooSlowHere } from "./speed";
import { ENGINE_VERSION, type CatalogModel, type LanguageTier, type UseCase, type UseTier } from "./types";
import type { QuickActionId } from "../chat/quickActions";

/** §7.8 recommendation rule: by use, by language, on this device. Pure; the vault and the chat both call it. */
export interface RecommendInput {
  use: UseCase;
  /** ISO 639-1 of what the user writes (or the app language); null when unknown, then language does not rank. */
  languageCode: string | null;
  device: DeviceProfile;
  /** Ids ready to load now. */
  installed: readonly string[];
  catalog: readonly CatalogModel[];
  engineVersion?: number;
}

export interface RecommendReason {
  use: UseCase;
  useTier: UseTier;
  languageCode: string | null;
  languageTier: LanguageTier | null;
  ramFit: RamFit;
  installed: boolean;
}

export interface ModelRecommendation {
  model: CatalogModel;
  reason: RecommendReason;
}

const tierIndex = (m: CatalogModel): number => (m.tier ? TIER_ORDER.indexOf(m.tier) : -1);

/** Chat models this device can run, best first: language, then use, then runs well, then already installed, then the §6.3 tier. */
export function rankModels(input: RecommendInput): ModelRecommendation[] {
  const { device, languageCode, use } = input;
  const ceiling = TIER_ORDER.indexOf(maxTier(device));
  const wanted = TIER_ORDER.indexOf(defaultTier(device));
  const engine = input.engineVersion ?? ENGINE_VERSION;
  const rows = input.catalog
    /* A tier that measures below a usable rate on this chip class is still installable, never recommended (QA F37). */
    .filter((m) => m.role === "chat" && m.fit && m.tier && m.minEngine <= engine && tierIndex(m) <= ceiling && ramFit(m, device.ramGB) !== "no" && !tooSlowHere(device.chip, m.tier))
    .map((model): ModelRecommendation => ({
      model,
      reason: { use, useTier: useTierOf(model, use)!, languageCode, languageTier: languageTierOf(model, languageCode), ramFit: ramFit(model, device.ramGB), installed: input.installed.includes(model.id) },
    }));
  const score = (r: ModelRecommendation): number[] => [
    languageCode ? languageRank(r.reason.languageTier ?? undefined) : 0,
    useRank(r.reason.useTier),
    r.reason.ramFit === "well" ? 1 : 0,
    r.reason.installed ? 1 : 0,
    -Math.abs(tierIndex(r.model) - wanted),
    -tierIndex(r.model),
  ];
  return rows.sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i]! - sa[i]!;
    return 0;
  });
}

export const recommendModel = (input: RecommendInput): ModelRecommendation | null => rankModels(input)[0] ?? null;

/** True when even this pick is basic/none for the language or weak for the use; the vault then says "nothing here is good at…" instead of RECOMMENDED. An unrated language (tier null) is never a claim either way. */
export const recommendationIsWeak = (r: ModelRecommendation): boolean =>
  (r.reason.languageCode !== null && (r.reason.languageTier === "basic" || r.reason.languageTier === "none")) || r.reason.useTier === "weak";

export interface AdviceInput extends RecommendInput {
  /** The loaded model; no advice without one or when it carries no fit block (imports). */
  current: CatalogModel | null | undefined;
}

export interface ModelAdvice {
  current: CatalogModel;
  /** What to offer now: the best installed model that improves on the current one, else the best installable. */
  better: ModelRecommendation;
  /** The top of the ranking when it is not `better` and still to install ("Sharp is best for Hebrew"). */
  best?: ModelRecommendation;
  language?: { code: string; from: LanguageTier; to: LanguageTier };
  use?: { use: UseCase; from: UseTier; to: UseTier };
  /** One string per (offer, reason); the chat snoozes by it so the same reason never nags twice. */
  key: string;
}

/**
 * The chat card (§7.8): only when the loaded model is weak for the language (basic / none) or for the use (weak), and another
 * model on this device does better on that dimension without doing worse on the other. Null when nothing better exists here.
 */
export function adviseModel(input: AdviceInput): ModelAdvice | null {
  const { current, languageCode, use } = input;
  if (!current?.fit) return null;
  const curLang = languageTierOf(current, languageCode);
  const curUse = useTierOf(current, use)!;
  const langWeak = curLang === "none" || curLang === "basic";
  const useWeak = curUse === "weak";
  if (!langWeak && !useWeak) return null;
  const candidates = rankModels(input).filter((r) => {
    if (r.model.id === current.id) return false;
    const dl = languageCode ? languageRank(r.reason.languageTier ?? undefined) - languageRank(curLang ?? undefined) : 0;
    const du = useRank(r.reason.useTier) - useRank(curUse);
    if (dl < 0 || du < 0) return false;
    return (langWeak && dl > 0) || (useWeak && du > 0);
  });
  if (!candidates.length) return null;
  const better = candidates.find((r) => r.reason.installed) ?? candidates[0]!;
  const top = candidates[0]!;
  const best = top.model.id !== better.model.id && !top.reason.installed ? top : undefined;
  /* Only the weak dimension is a reason; "good → best" on the other one is a bonus the card does not preach about. */
  const language = langWeak && languageCode && curLang && better.reason.languageTier && languageRank(better.reason.languageTier) > languageRank(curLang) ? { code: languageCode, from: curLang, to: better.reason.languageTier } : undefined;
  const useGain = useWeak && useRank(better.reason.useTier) > useRank(curUse) ? { use, from: curUse, to: better.reason.useTier } : undefined;
  return {
    current,
    better,
    ...(best ? { best } : {}),
    ...(language ? { language } : {}),
    ...(useGain ? { use: useGain } : {}),
    key: `${current.id}>${better.model.id}|${language ? `lang:${language.code}` : ""}|${useGain ? `use:${useGain.use}` : ""}`,
  };
}

/**
 * What the loaded model is not good at, for a tier that can neither install nor switch (the browser holds one model):
 * the same verdict `recommendationIsWeak` gives the vault picker, stated instead of offered. Null when it is up to the job.
 */
export function modelShortfall(current: CatalogModel | null | undefined, use: UseCase, languageCode: string | null): { use: UseCase; languageCode: string } | null {
  if (!current?.fit || !languageCode) return null;
  const languageTier = languageTierOf(current, languageCode);
  /* The line names the language, so an unrated one would turn a weak *use* into a claim about a language we never measured. */
  if (languageTier === null) return null;
  const weak = useTierOf(current, use) === "weak" || languageTier === "basic" || languageTier === "none";
  return weak ? { use, languageCode } : null;
}

export interface UseSignals {
  text: string;
  personaId?: string | null;
  /** Custom personas carry no known id; their icon still says what they are for. */
  personaIcon?: string | null;
  hasDocuments?: boolean;
  quickAction?: QuickActionId | null;
  dictated?: boolean;
}

const CODE_MARKS: readonly RegExp[] = [
  /\b(?:function|const|let|var|def|class|import|return|public|private|void|int|fn|struct|impl|elif|lambda)\b[^\n]*[{(:;=]/,
  /=>|::|->|\+\+|&&|\|\|/,
  /<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?>/i,
  /;\s*$/m,
  /\b(?:SELECT|INSERT|UPDATE|DELETE)\b[\s\S]+\b(?:FROM|INTO|SET|WHERE)\b/i,
  /#include|#!\/|\$\(|\bnpm |\bpip |\bgit |\bconsole\.log|printf\(|System\.out/,
  /\b(?:code|bug|regex|script|compile|stack ?trace|exception|function|typescript|python|javascript|sql)\b/i,
];
const MATH_MARKS: readonly RegExp[] = [/\b(?:solve|equation|integral|derivative|probability|theorem|prove|logarithm|matrix)\b/i, /\d\s*[+\-*/×÷^]\s*\d+\s*=/, /\\(?:frac|int|sum|sqrt)\b/, /\b\d+\s*[+\-*/×÷]\s*\d+\s*[+\-*/×÷=]/];

export const looksLikeCode = (text: string): boolean => /```/.test(text) || CODE_MARKS.filter((re) => re.test(text)).length >= 2;
export const looksLikeMath = (text: string): boolean => MATH_MARKS.some((re) => re.test(text));

const QUICK_USE: Record<QuickActionId, UseCase> = { summarize: "summarize", rephrase: "writing", fixGrammar: "writing", translate: "translate", explain: "chat", extractTasks: "summarize" };
const PERSONA_USE: Record<string, UseCase> = { "builtin:writer": "writing", "builtin:translator": "translate" };
const ICON_USE: Record<string, UseCase> = { pen: "writing", globe: "translate", code: "code", flask: "math" };

/** What the user decided to do, from the strongest signal down: attached documents, a quick action, code or math in the text, dictation, the persona, else chat. */
export function detectUse(s: UseSignals): UseCase {
  if (s.hasDocuments) return "documents";
  if (s.quickAction) return QUICK_USE[s.quickAction];
  if (looksLikeCode(s.text)) return "code";
  if (looksLikeMath(s.text)) return "math";
  if (s.dictated) return "voice";
  if (s.personaId && PERSONA_USE[s.personaId]) return PERSONA_USE[s.personaId]!;
  if (s.personaIcon && ICON_USE[s.personaIcon]) return ICON_USE[s.personaIcon]!;
  return "chat";
}

export interface ModelChoice {
  model: CatalogModel;
  reason: RecommendReason;
  installed: boolean;
  /** The model the engine has loaded right now. */
  current: boolean;
  /** Listed for honesty, never offered: this device cannot run it (§6.3), or the app is too old. */
  blocked?: "ram" | "engine" | "slow";
}

export interface ModelChoicesInput extends RecommendInput {
  /** The loaded model; it heads the installed list even when the ranking would drop it. */
  currentId?: string | null;
  /** Ids the recommendation may pick from. The browser tier can only ever load the one it holds (§14.3), so it must not
   * be told that a model it cannot install is "recommended on this browser". Every id, when absent. */
  recommendAmong?: readonly string[];
}

export interface ModelChoices {
  /** Ready to load now, best first: one tap switches. */
  installed: ModelChoice[];
  /** Runs here once downloaded, best first. */
  available: ModelChoice[];
  /** Too big for this device or too new for this app; greyed, no action. */
  unavailable: ModelChoice[];
  /** The "Recommended for you" line, from the same ranking the vault uses. */
  recommended: ModelRecommendation | null;
  /** True when even that pick is basic/none for the language or weak for the use: the line says so instead of claiming a fit. */
  recommendedWeak: boolean;
}

/**
 * Everything the chat's Model sheet lists (§7.8, §8.4), from the one ranking `rankModels` already computes:
 * installed first, then what this device can still download, then what it cannot run, with the reason.
 */
export function modelChoices(input: ModelChoicesInput): ModelChoices {
  const { device, languageCode, use } = input;
  const engine = input.engineVersion ?? ENGINE_VERSION;
  const ranked = rankModels(input);
  const rankOf = new Map(ranked.map((r, i) => [r.model.id, i]));
  const installedSet = new Set(input.installed);
  const choiceOf = (model: CatalogModel, blocked?: ModelChoice["blocked"]): ModelChoice => ({
    model,
    reason: { use, useTier: useTierOf(model, use) ?? "weak", languageCode, languageTier: languageTierOf(model, languageCode), ramFit: ramFit(model, device.ramGB), installed: installedSet.has(model.id) },
    installed: installedSet.has(model.id),
    current: !!input.currentId && model.id === input.currentId,
    ...(blocked ? { blocked } : {}),
  });
  const ceiling = TIER_ORDER.indexOf(maxTier(device));
  const blockedReason = (m: CatalogModel): ModelChoice["blocked"] => (m.minEngine > engine ? "engine" : ramFit(m, device.ramGB) === "no" || tierIndex(m) > ceiling ? "ram" : "slow");
  const chat = input.catalog.filter((m) => m.role === "chat" && m.fit && m.tier);
  const installed: ModelChoice[] = [];
  const available: ModelChoice[] = [];
  const unavailable: ModelChoice[] = [];
  for (const model of chat) {
    const runnable = rankOf.has(model.id);
    /* An installed model always stays switchable: it is on the disk and it loads, whatever the ranking left out. */
    if (installedSet.has(model.id) || model.id === input.currentId) installed.push(choiceOf(model));
    else if (runnable) available.push(choiceOf(model));
    else unavailable.push(choiceOf(model, blockedReason(model)));
  }
  const byRank = (a: ModelChoice, b: ModelChoice) => (rankOf.get(a.model.id) ?? chat.length) - (rankOf.get(b.model.id) ?? chat.length);
  installed.sort(byRank);
  available.sort(byRank);
  unavailable.sort((a, b) => tierIndex(a.model) - tierIndex(b.model));
  const recommended = (input.recommendAmong ? ranked.filter((r) => input.recommendAmong!.includes(r.model.id)) : ranked)[0] ?? null;
  return { installed, available, unavailable, recommended, recommendedWeak: !!recommended && recommendationIsWeak(recommended) };
}

export interface LanguageUpgrade {
  code: string;
  /** What the loaded model rates this language. */
  from: LanguageTier;
  /** The model to offer: the best installed one that does better, else the best installable one. */
  better: ModelRecommendation;
  /** The top of the ranking when it is not `better` and still to install. */
  best?: ModelRecommendation;
}

/**
 * §7.8 language notice: the loaded model rates what the user writes `none` or `basic`, and something on this device
 * does better. Unlike `adviseModel` this ignores the use dimension — a language the model cannot write is reason enough.
 * Null when the language is unrated, already good, or nothing here improves on it.
 */
export function betterForLanguage(input: AdviceInput): LanguageUpgrade | null {
  const { current, languageCode } = input;
  if (!current?.fit || !languageCode) return null;
  const from = languageTierOf(current, languageCode);
  if (from !== "none" && from !== "basic") return null;
  const candidates = rankModels(input).filter((r) => r.model.id !== current.id && languageRank(r.reason.languageTier ?? undefined) > languageRank(from));
  if (!candidates.length) return null;
  const better = candidates.find((r) => r.reason.installed) ?? candidates[0]!;
  const top = candidates[0]!;
  return { code: languageCode, from, better, ...(top.model.id !== better.model.id && !top.reason.installed ? { best: top } : {}) };
}
