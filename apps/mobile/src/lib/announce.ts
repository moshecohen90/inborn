/** Sentence-sized chunks of a streaming answer for a screen reader (QA T26): pure, no React Native here. */

/** Last sentence end at or after `from`: a terminator (with a closing quote or bracket) before whitespace, or a line break. */
export function completedUpTo(content: string, from: number): number {
  const re = /[.!?…]["'”’)\]]*(?=\s)|\n/g;
  re.lastIndex = from;
  let end = from;
  for (let m = re.exec(content); m; m = re.exec(content)) end = m.index + m[0].length;
  return end;
}

/** Markdown marks that a voice should not read: emphasis, headings, code fences, list bullets, table pipes. */
export function plainForSpeech(text: string): string {
  return text
    .replace(/```[a-z]*\n?/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The next thing to say: the completed sentences after `announcedUpTo`, or null when nothing new has finished. */
export function nextAnnouncement(content: string, announcedUpTo: number): { upTo: number; text: string } | null {
  const upTo = completedUpTo(content, announcedUpTo);
  if (upTo <= announcedUpTo) return null;
  const text = plainForSpeech(content.slice(announcedUpTo, upTo));
  return text ? { upTo, text } : { upTo, text: "" };
}

/** The row's spoken label: its first non-empty line, trimmed to a sentence or so. */
export function firstLineForSpeech(content: string, max = 160): string {
  const line = content.split("\n").map(plainForSpeech).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
