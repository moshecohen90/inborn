/* The repo copies open with a heading and the effective-date block; the reader gets the text from its first section
   heading. Kept out of the screen file so a test can render it without pulling React Native in. */
export function legalBody(source: string): string {
  const lines = source.split("\n");
  const first = lines.findIndex((l) => /^##\s/.test(l));
  return (first > 0 ? lines.slice(first) : lines).join("\n").trim();
}
