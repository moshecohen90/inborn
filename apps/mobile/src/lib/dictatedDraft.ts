/** A send counts as dictated (§7.8 "voice" use) when the dictation's final text is still in what was sent; typing over it makes it a typed message. */
export const isDictatedSend = (dictated: string | null | undefined, sent: string): boolean => {
  const d = dictated?.trim() ?? "";
  return d.length > 0 && sent.trim().includes(d);
};
