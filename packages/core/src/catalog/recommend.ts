import { languageRank, languageTierOf, useRank, useTierOf } from "./fit";
import { TIER_ORDER, defaultTier, maxTier, ramFit, type DeviceProfile, type RamFit } from "./pick";
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
    .filter((m) => m.role === "chat" && m.fit && m.tier && m.minEngine <= engine && tierIndex(m) <= ceiling && ramFit(m, device.ramGB) !== "no")
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
