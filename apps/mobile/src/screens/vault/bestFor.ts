import { USE_CASES, type UseCase } from "@inborn/core";

type T = (key: string, params?: Record<string, unknown>) => string;

/** The vault's "Best for" uses: tapping a row adds or removes it, the last one stays, and the list keeps catalog order. */
export function toggleUse(uses: readonly UseCase[], use: UseCase): UseCase[] {
  if (uses.includes(use)) return uses.length > 1 ? uses.filter((u) => u !== use) : [...uses];
  return USE_CASES.filter((u) => u === use || uses.includes(u));
}

/** "Chat", "Chat + Documents", past two "Chat +2". */
export function usesLabel(t: T, uses: readonly UseCase[]): string {
  const [first, second] = uses.map((u) => t(`use.${u}`));
  if (uses.length === 1) return first!;
  if (uses.length === 2) return t("vault.bestFor.two", { first, second });
  return t("vault.bestFor.more", { first, count: uses.length - 1 });
}

/** Non-breaking spaces inside a "Use · Tier" pair, so a card's per-use line wraps only between pairs, never inside one. */
export const unbreakable = (text: string): string => text.replace(/ /g, "\u00A0");
export const usePairLead = (useName: string): string => `${unbreakable(useName)}\u00A0·\u00A0`;
