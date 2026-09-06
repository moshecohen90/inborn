import { can, limits, type Feature } from "./gates";
import type { LicenceTier } from "./types";

/**
 * The §12.3 value moments: the exact taps where a Free user meets Pro. Each answers "does this tap open the
 * paywall instead of doing the thing?" so every screen asks the same question the same way.
 */
export type ValueMoment =
  /** Creating one more custom persona (`existing` = custom personas already stored); Free has 3. */
  | { kind: "persona"; existing: number }
  /** Adding one more document to the library (`existing` = documents already there); Free has 1. */
  | { kind: "document"; existing: number }
  /** Installing a catalog model flagged `proOnly` (Sharp). */
  | { kind: "model"; proOnly: boolean }
  /** Any feature from the §7.5–§7.9 table (voice, folders, memory, export all…). */
  | { kind: "feature"; feature: Feature };

export function paywallFor(tier: LicenceTier, moment: ValueMoment): boolean {
  switch (moment.kind) {
    case "persona":
      return !can(tier, "unlimitedPersonas") && moment.existing >= limits(tier).personas;
    case "document":
      return !can(tier, "documents") && moment.existing >= limits(tier).filesPerChat;
    case "model":
      return moment.proOnly && !can(tier, "proModels");
    case "feature":
      return !can(tier, moment.feature);
  }
}
