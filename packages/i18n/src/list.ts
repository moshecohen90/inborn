/**
 * Compact, separator-only joining for the enumerations the UI shows as data rows
 * (fit-map tiers, language lists, document names).
 *
 * `Intl.ListFormat` is deliberately not used here: every style it offers inserts a word or the
 * wrong mark for these rows — zh-Hant "A、B和C", ko "A, B 및 C", de "A, B und C", ja unit "A B C" —
 * and Hermes ships no ListFormat at all, so the phone and the browser would disagree.
 */

/** Languages whose lists take the ideographic comma; everything else takes a comma + space. */
const SEPARATOR: Readonly<Record<string, string>> = { ja: "、", zh: "、" };

export const listSeparator = (locale: string): string => SEPARATOR[(locale || "en").toLowerCase().split(/[-_]/)[0] ?? ""] ?? ", ";

export const joinList = (locale: string, items: readonly string[]): string => items.join(listSeparator(locale));
