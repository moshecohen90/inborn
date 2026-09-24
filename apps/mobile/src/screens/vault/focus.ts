/** Where the card for `id` sits in the vault's SectionList, or null when the list does not show it. */
export function focusLocation(sections: readonly { data: readonly { model: { id: string } }[] }[], id: string | undefined): { sectionIndex: number; itemIndex: number } | null {
  if (!id) return null;
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const itemIndex = sections[sectionIndex]!.data.findIndex((e) => e.model.id === id);
    if (itemIndex >= 0) return { sectionIndex, itemIndex };
  }
  return null;
}
