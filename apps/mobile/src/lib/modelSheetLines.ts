import { USE_CASES, formatModelBytes, type CatalogModel, type ModelChoices, type RoomNote, type UseCase } from "@inborn/core";

/** Which of the vault's three recommendation lines the Model sheet shows; null when nothing here can be recommended. */
export type RecommendationKey = "models.recommended" | "models.recommendedFor" | "models.recommendedNone";

/**
 * §7.8: with a language in hand the line names the use and the language, and says plainly when even the top pick is
 * weak at the pair; without one it only names the device. The vault's picker says the same three things (QA F150).
 */
export function recommendationKey(choices: Pick<ModelChoices, "recommended" | "recommendedWeak">, languageCode: string | null): RecommendationKey | null {
  if (!choices.recommended) return null;
  if (!languageCode) return "models.recommended";
  return choices.recommendedWeak ? "models.recommendedNone" : "models.recommendedFor";
}

/** What a row claims the model is good at: the uses the fit map rates best or good, plus photos, which no use case covers. */
export function goodAtUses(model: Pick<CatalogModel, "fit" | "vision">): (UseCase | "photos")[] {
  const fit = model.fit;
  return [...USE_CASES.filter((u) => fit && (fit.uses[u] === "best" || fit.uses[u] === "good")), ...(model.vision ? (["photos"] as const) : [])];
}

/** `models.roomNote` for every surface that names the recommendation: the model the space ruled out, what it needs, what is free, and the pick. */
export const roomNoteParams = (note: RoomNote): Record<string, string> => ({
  model: note.skipped.name,
  needed: formatModelBytes(note.neededBytes),
  free: formatModelBytes(note.freeBytes),
  picked: note.picked.name,
});
