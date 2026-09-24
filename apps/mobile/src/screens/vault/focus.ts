/** Where the card for `id` sits in the vault's SectionList, or null when the list does not show it. */
export function focusLocation(sections: readonly { data: readonly { model: { id: string } }[] }[], id: string | undefined): { sectionIndex: number; itemIndex: number } | null {
  if (!id) return null;
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const itemIndex = sections[sectionIndex]!.data.findIndex((e) => e.model.id === id);
    if (itemIndex >= 0) return { sectionIndex, itemIndex };
  }
  return null;
}

/** What the vault passes to scrollToLocation for `id`: the card centred on screen. */
export function focusScrollTarget(sections: readonly { data: readonly { model: { id: string } }[] }[], id: string | undefined): { sectionIndex: number; itemIndex: number; viewPosition: number; viewOffset: number; animated: boolean } | null {
  const at = focusLocation(sections, id);
  /* VirtualizedSectionList counts the section header as item 0, so the card is one further. */
  return at ? { sectionIndex: at.sectionIndex, itemIndex: at.itemIndex + 1, viewPosition: 0.5, viewOffset: 0, animated: true } : null;
}

/** How long the vault keeps re-landing on the card while rows above it are still measured or change state (F373). */
export const FOCUS_SETTLE_MS = 2500;
/** How long the landed card keeps its accent border. */
export const FOCUS_FLASH_MS = 3000;
