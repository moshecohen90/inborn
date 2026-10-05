import { languageRank, languageTierOf, useRank, useTierOf } from "./fit";
import { TIER_ORDER, defaultTier, fitsRoom, maxTier, ramFit, roomNote, type DeviceProfile, type RamFit, type RoomNote, type StorageRoom } from "./pick";
import { tooSlowHere } from "./speed";
import { ENGINE_VERSION, type CatalogModel, type LanguageTier, type UseCase, type UseTier } from "./types";
import type { QuickActionId } from "../chat/quickActions";
import { isRewriteAsk } from "../chat/length";

/** §7.8 recommendation rule: by use, by language, on this device. Pure; the vault and the chat both call it. */
export interface RecommendInput {
  use: UseCase;
  /** Several uses at once (the vault's Best for): a model is as good as its weakest; absent or one item ranks by `use` alone. */
  uses?: readonly UseCase[];
  /** ISO 639-1 of what the user writes (or the app language); null when unknown, then language does not rank. */
  languageCode: string | null;
  device: DeviceProfile;
  /** Ids ready to load now. */
  installed: readonly string[];
  catalog: readonly CatalogModel[];
  engineVersion?: number;
  /** Free space right now; with it, a model that fits outranks every one that does not. Unknown when absent. */
  room?: StorageRoom | null;
}

export interface RecommendReason {
  use: UseCase;
  useTier: UseTier;
  languageCode: string | null;
  languageTier: LanguageTier | null;
  ramFit: RamFit;
  installed: boolean;
  /** Set only for several uses: each picked use with its tier; `use` / `useTier` then name the weakest. */
  useTiers?: { use: UseCase; tier: UseTier }[];
}

export interface ModelRecommendation {
  model: CatalogModel;
  reason: RecommendReason;
}

const tierIndex = (m: CatalogModel): number => (m.tier ? TIER_ORDER.indexOf(m.tier) : -1);

/** The picked use this model is worst at (the first one on a tie); several uses are only as good as this one. */
export function weakestUse(model: Pick<CatalogModel, "fit">, uses: readonly UseCase[]): { use: UseCase; tier: UseTier } {
  return uses.map((use) => ({ use, tier: useTierOf(model, use)! })).reduce((a, b) => (useRank(b.tier) < useRank(a.tier) ? b : a));
}

/** At least "good" at every picked use: the vault lists these above its "not good at all of these" line. */
export const goodAtAll = (r: ModelRecommendation): boolean => r.reason.useTier !== "weak";

/** Chat models this device can run, best first: language, then use, then runs well, then already installed, then the §6.3 tier. */
export function rankModels(input: RecommendInput): ModelRecommendation[] {
  const { device, languageCode, use } = input;
  const several = !!input.uses && input.uses.length > 1;
  const ceiling = TIER_ORDER.indexOf(maxTier(device));
  const wanted = TIER_ORDER.indexOf(defaultTier(device));
  const engine = input.engineVersion ?? ENGINE_VERSION;
  const rows = input.catalog
    /* A tier that measures below a usable rate on this chip class is still installable, never recommended (QA F37). */
    .filter((m) => m.role === "chat" && m.fit && m.tier && m.minEngine <= engine && tierIndex(m) <= ceiling && ramFit(m, device.ramGB) !== "no" && !tooSlowHere(device.chip, m.tier))
    .map((model): ModelRecommendation => {
      const reason: RecommendReason = { use, useTier: useTierOf(model, use)!, languageCode, languageTier: languageTierOf(model, languageCode), ramFit: ramFit(model, device.ramGB), installed: input.installed.includes(model.id) };
      if (!several) return { model, reason };
      const weakest = weakestUse(model, input.uses!);
      return { model, reason: { ...reason, use: weakest.use, useTier: weakest.tier, useTiers: input.uses!.map((u) => ({ use: u, tier: useTierOf(model, u)! })) } };
    });
  const score = (r: ModelRecommendation): number[] => [
    /* Good at all the picked uses leads, above room and language, so the vault's one divider splits every section cleanly. */
    ...(several ? [goodAtAll(r) ? 1 : 0] : []),
    fitsRoom(r.model, input.room) ? 1 : 0,
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

/**
 * The one RECOMMENDED every surface names (Moshe 23.9, decision 6: the best model for this device first): §7.8 on
 * use, language and device, with what is already installed left out, so a bundled Instant never outranks the tier
 * the device is meant to run. Onboarding, the vault, the chat's Model sheet and the browser door all call this.
 */
export const deviceRecommendation = (input: RecommendInput): ModelRecommendation | null => rankModels({ ...input, installed: [] })[0] ?? null;

/** "Fast needs 1.55 GB; you have 944 MB": set when the free space, and nothing else, moved `deviceRecommendation` off its first choice. */
export const recommendationRoomNote = (input: RecommendInput): RoomNote | null =>
  roomNote(input.room, (room) => deviceRecommendation({ ...input, room })?.model);

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
  /** The loaded model could not give a sound answer about a picture, and `better` sees with a bigger model (round 131). */
  photos?: true;
  /** One string per (offer, reason); the chat snoozes by it so the same reason never nags twice. */
  key: string;
}

/** `better` is what this user can get without paying; a Pro-only top pick may only ride along as `best`. */
function offerOf(candidates: readonly ModelRecommendation[], pro: boolean | undefined): { better: ModelRecommendation; best?: ModelRecommendation } | null {
  const reachable = pro ? candidates : candidates.filter((r) => !r.model.proOnly);
  const better = reachable.find((r) => r.reason.installed) ?? reachable[0];
  if (!better) return null;
  const top = candidates[0]!;
  return top.model.id !== better.model.id && !top.reason.installed ? { better, best: top } : { better };
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
  const offer = offerOf(candidates, input.device.pro);
  if (!offer) return null;
  const { better, best } = offer;
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

/** After a picture answer on Instant: a higher-tier model on this device that also sees, or null. */
export function advisePhotoModel(input: AdviceInput): ModelAdvice | null {
  const { current } = input;
  /* Measured 4.10.2026: Sharp reads pictures no better than Fast, so only Instant has a better seer to offer. */
  if (current?.tier !== "instant") return null;
  const offer = offerOf(
    rankModels(input).filter((r) => r.model.vision && tierIndex(r.model) > tierIndex(current)),
    input.device.pro,
  );
  if (!offer) return null;
  /* The card's "best" line names a use or a language; a picture is neither, so only the offer itself is shown. */
  return { current, better: offer.better, photos: true, key: `${current.id}>${offer.better.model.id}|photos` };
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

/* "Write a Python function that…" names one code word, which `looksLikeCode` (two marks) rightly reads as prose. */
const CODE_ASK =
  /\b(?:write|create|make|give me|implement|build)\b[^.?!\n]{0,40}\b(?:function|script|code|program|class|regex|query|snippet)\b|(?:schreib|erstell)[^.?!\n]{0,40}(?:funktion|skript|code|programm)|(?:escrib|crea|haz)[^.?!\n]{0,40}(?:función|script|código|programa)|(?:écri|crée|fais)[^.?!\n]{0,40}(?:fonction|script|code|programme)|(?:escrev|cri[ae]|faça)[^.?!\n]{0,40}(?:função|script|código|programa)|(?:関数|スクリプト|コード|プログラム)[^。？\n]{0,20}(?:書い|作っ|作成)|(?:함수|스크립트|코드|프로그램)[^.?\n]{0,20}(?:작성|짜|만들|써)|(?:寫|写|編寫|编写)[^。？\n]{0,20}(?:函數|函数|程式|程序|代碼|代码|腳本|脚本)/i;

export const looksLikeCode = (text: string): boolean => /```/.test(text) || CODE_MARKS.filter((re) => re.test(text)).length >= 2;
export const looksLikeMath = (text: string): boolean => MATH_MARKS.some((re) => re.test(text));

const QUICK_USE: Record<QuickActionId, UseCase> = { summarize: "summarize", rephrase: "writing", fixGrammar: "writing", translate: "translate", explain: "chat", extractTasks: "summarize" };
const PERSONA_USE: Record<string, UseCase> = { "builtin:writer": "writing", "builtin:translator": "translate" };
const ICON_USE: Record<string, UseCase> = { pen: "writing", globe: "translate", code: "code", flask: "math" };

/** What the user decided to do, from the strongest signal down: attached documents, a quick action, code or math in the text, dictation, the persona, else chat. */
export function detectUse(s: UseSignals): UseCase {
  if (s.hasDocuments) return "documents";
  if (s.quickAction) return QUICK_USE[s.quickAction];
  if (looksLikeCode(s.text) || CODE_ASK.test(s.text)) return "code";
  if (looksLikeMath(s.text)) return "math";
  if (s.dictated) return "voice";
  if (isRewriteAsk(s.text)) return "writing";
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
  /** Set when the free space moved the recommendation to a smaller model. */
  room?: RoomNote | null;
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
  const top = input.recommendAmong ? null : deviceRecommendation(input);
  const recommended = input.recommendAmong ? (ranked.filter((r) => input.recommendAmong!.includes(r.model.id))[0] ?? null) : top ? (ranked.find((r) => r.model.id === top.model.id) ?? top) : null;
  const room = input.recommendAmong ? null : recommendationRoomNote(input);
  return { installed, available, unavailable, recommended, recommendedWeak: !!recommended && recommendationIsWeak(recommended), room };
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
  const offer = offerOf(candidates, input.device.pro);
  if (!offer) return null;
  return { code: languageCode, from, better: offer.better, ...(offer.best ? { best: offer.best } : {}) };
}
