import { FIT_LANGUAGES, LANGUAGE_TIERS, USE_CASES, USE_TIERS, type CatalogModel, type LanguageTier, type ModelFit, type UseCase, type UseTier } from "./types";

/** Higher is better; "none" and "weak" are 0. */
export const languageRank = (t: LanguageTier | undefined): number => (t ? LANGUAGE_TIERS.length - 1 - LANGUAGE_TIERS.indexOf(t) : 0);
export const useRank = (t: UseTier | undefined): number => (t ? USE_TIERS.length - 1 - USE_TIERS.indexOf(t) : 0);

/** A model without a fit block (import, Hugging Face pick) is rated unknown: never recommended over, never recommended against. */
export const languageTierOf = (model: Pick<CatalogModel, "fit">, code: string | null): LanguageTier | null => (code && model.fit ? (model.fit.languages[code] ?? "none") : null);
export const useTierOf = (model: Pick<CatalogModel, "fit">, use: UseCase): UseTier | null => model.fit?.uses[use] ?? null;

/** The flat `goodLanguages` list a fit block implies (native or good, catalog order). */
export const goodLanguagesOf = (fit: ModelFit): string[] => Object.entries(fit.languages).filter(([, t]) => t === "native" || t === "good").map(([c]) => c);

export type FitProblem = `use.${string}` | `language.${string}` | "weakAt" | "goodLanguages";

/** Schema check for one catalog entry: every use rated, every required language rated with a known tier, a weak-at line, goodLanguages derived. */
export function validateFit(model: Pick<CatalogModel, "fit" | "goodLanguages">): FitProblem[] {
  const fit = model.fit;
  if (!fit) return ["weakAt", ...USE_CASES.map((u) => `use.${u}` as const), ...FIT_LANGUAGES.map((l) => `language.${l}` as const)];
  const problems: FitProblem[] = [];
  for (const u of USE_CASES) if (!USE_TIERS.includes(fit.uses[u])) problems.push(`use.${u}`);
  for (const u of Object.keys(fit.uses)) if (!USE_CASES.includes(u as UseCase)) problems.push(`use.${u}`);
  for (const l of FIT_LANGUAGES) if (!(l in fit.languages)) problems.push(`language.${l}`);
  for (const [l, t] of Object.entries(fit.languages)) if (!/^[a-z]{2}$/.test(l) || !LANGUAGE_TIERS.includes(t)) problems.push(`language.${l}`);
  if (typeof fit.weakAt !== "string" || !fit.weakAt.trim()) problems.push("weakAt");
  if ([...model.goodLanguages].sort().join() !== goodLanguagesOf(fit).sort().join()) problems.push("goodLanguages");
  return problems;
}
