/** Continue (F390): the rest of a stopped answer is joined to what is on screen with the separator the script uses. */
const OPENERS = new Set(Array.from("([{“‘«„‚¿¡</-—–「『（【〈《"));
const LEADING_PUNCT = new Set(Array.from(".,;:!?)]}…%’”»'、。，．！？；：」』）】〉》・"));
/* Scripts written without spaces between words. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\u3000-\u303F\uFF00-\uFFEF]/u;

/** What goes between `prefix` (on screen) and `next` (the model's first continued text): " " or "". */
export function continuationSeparator(prefix: string, next: string): string {
  if (!prefix || !next) return "";
  const last = Array.from(prefix.slice(-2)).pop()!;
  const first = String.fromCodePoint(next.codePointAt(0)!);
  if (/\s/u.test(last) || /\s/u.test(first)) return "";
  if (OPENERS.has(last) || LEADING_PUNCT.has(first)) return "";
  if (UNSPACED.test(last) || UNSPACED.test(first)) return "";
  return " ";
}
