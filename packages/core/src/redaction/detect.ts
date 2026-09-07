/**
 * On-device detectors for the redaction sheet (spec §7.3 Work "redaction before pasting"). Pure regex + checksums:
 * a number is a card only if Luhn agrees, an IBAN only if mod-97 agrees, an Israeli ID only if its check digit agrees,
 * so amounts and order numbers stay readable. Names come only from the user's own list.
 */

export type RedactKind = "email" | "phone" | "card" | "iban" | "id" | "ssn" | "name" | "date";

export const REDACT_KINDS: readonly RedactKind[] = ["email", "phone", "card", "iban", "id", "ssn", "name", "date"];

export interface Detection {
  kind: RedactKind;
  start: number;
  end: number;
  value: string;
}

export interface DetectOptions {
  /** Which kinds to look for; dates default to off (they are usually the point of the question). */
  kinds?: Partial<Record<RedactKind, boolean>>;
  /** The user's own list of names (people, companies, matters). */
  names?: string[];
}

const digits = (s: string): string => s.replace(/\D/g, "");

/** Luhn (ISO/IEC 7812) over the digits of a candidate card number. */
export function luhnValid(s: string): boolean {
  const d = digits(s);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/** IBAN mod-97 (ISO 13616) on the compact form. */
export function ibanValid(s: string): boolean {
  const c = s.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(c)) return false;
  const rearranged = c.slice(4) + c.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const x of v) rem = (rem * 10 + Number(x)) % 97;
  }
  return rem === 1;
}

/** Israeli ID: 9 digits (an 8-digit form is padded), weighted 1-2-1-2…, digits over 9 fold, total divisible by 10. */
export function israeliIdValid(s: string): boolean {
  const d = digits(s).padStart(9, "0");
  if (d.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(d[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const IBAN = /(?<![A-Z0-9])[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}(?![A-Z0-9])/g;
const CARD = /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g;
const SSN = /(?<!\d)(?!000|666|9\d\d)\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}(?!\d)/g;
const ISRAELI_ID = /(?<![\d-])\d{8,9}(?![\d-])/g;
const PHONE = /(?<![\d\w+])(?:\+|00)?\d{1,4}(?:[ .-]?\(?\d{1,4}\)?){1,5}(?![\d\w])/g;
const DATE = /(?<!\d[./-]|[\d.])(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})(?!\d|[./-]\d)|\b\d{1,2}(?:st|nd|rd|th)? (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?,? \d{4}\b|(?<![\p{L}\d])\d{1,2} ב?(?:ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר) \d{4}(?![\p{L}\d])/gu;

/** Words before a number that name what it is; Hebrew and English (ת"ז, ID, tel, נייד…). */
const ID_HINT = /(?:ת\.?\s?ז\.?|ת"ז|תעודת\s+זהות|מספר\s+זהות|\bID(?:\s*(?:no|number|#))?|\bSSN|passport|דרכון)\s*[:#.]?\s*$/iu;
const PHONE_HINT = /(?:טל(?:פון)?\.?|נייד|פלאפון|סלולרי|\btel\.?|\bphone|\bmobile|\bcell|\bfax|\bwhatsapp)\s*[:#.]?\s*$/iu;

const before = (text: string, at: number): string => text.slice(Math.max(0, at - 24), at);

function phoneLooksReal(raw: string, text: string, at: number): boolean {
  const d = digits(raw);
  if (d.length < 7 || d.length > 15) return false;
  const hasShape = /[ .()+-]/.test(raw.trim());
  if (PHONE_HINT.test(before(text, at))) return true;
  if (hasShape) return raw.startsWith("+") || raw.startsWith("00") || /^0/.test(raw) || d.length >= 9;
  /* A bare run of digits is a phone only in a national (leading 0) or international shape; 1500000 stays a number. */
  return (/^0/.test(raw) && d.length >= 9 && d.length <= 11) || (/^(?:\+|00)/.test(raw) && d.length >= 10);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A name from the list: Latin case-insensitive on word boundaries; Hebrew accepts one or two clitic prefixes (ו/ה/ל/ב/מ/ש/כ) before it. */
export function nameRegex(name: string): RegExp | null {
  const n = name.trim();
  if (n.length < 2) return null;
  const hebrew = /[֐-׿]/.test(n);
  return hebrew ? new RegExp(`(?<![\\p{L}\\p{N}])[ובלמשהכ]{0,2}(${escapeRe(n)})(?![\\p{L}\\p{N}])`, "gu") : new RegExp(`(?<![\\p{L}\\p{N}])(${escapeRe(n)})(?![\\p{L}\\p{N}])`, "giu");
}

const PRIORITY: Record<RedactKind, number> = { email: 8, iban: 7, card: 6, ssn: 5, id: 4, phone: 3, date: 2, name: 1 };

/** Every match of every enabled kind; overlaps resolve to the stronger detector, then the longer match. */
export function detect(text: string, opts: DetectOptions = {}): Detection[] {
  const on = (k: RedactKind): boolean => opts.kinds?.[k] ?? k !== "date";
  const found: Detection[] = [];
  const push = (kind: RedactKind, start: number, value: string) => found.push({ kind, start, end: start + value.length, value });
  if (on("email")) for (const m of text.matchAll(EMAIL)) push("email", m.index, m[0]);
  if (on("iban")) for (const m of text.matchAll(IBAN)) if (ibanValid(m[0])) push("iban", m.index, m[0]);
  if (on("card")) for (const m of text.matchAll(CARD)) if (luhnValid(m[0])) push("card", m.index, m[0]);
  if (on("ssn")) for (const m of text.matchAll(SSN)) push("ssn", m.index, m[0]);
  if (on("id") || on("phone")) {
    for (const m of text.matchAll(ISRAELI_ID)) {
      const ctx = before(text, m.index);
      const idHint = ID_HINT.test(ctx);
      const phoneHint = PHONE_HINT.test(ctx);
      /* Nine digits with a leading zero read as an Israeli landline unless the text says it is an ID. */
      const isId = israeliIdValid(m[0]) && !phoneHint && (idHint || !/^0/.test(m[0]));
      if (isId) {
        if (on("id")) push("id", m.index, m[0]);
      } else if (on("phone") && phoneLooksReal(m[0], text, m.index)) push("phone", m.index, m[0]);
    }
  }
  if (on("phone")) for (const m of text.matchAll(PHONE)) if (phoneLooksReal(m[0], text, m.index)) push("phone", m.index, m[0]);
  if (on("date")) for (const m of text.matchAll(DATE)) push("date", m.index, m[0]);
  if (on("name")) {
    for (const name of opts.names ?? []) {
      const re = nameRegex(name);
      if (!re) continue;
      for (const m of text.matchAll(re)) {
        const inner = m[1]!;
        push("name", m.index + m[0].indexOf(inner), inner);
      }
    }
  }
  found.sort((a, b) => a.start - b.start || PRIORITY[b.kind] - PRIORITY[a.kind] || b.end - a.end);
  const out: Detection[] = [];
  for (const d of found) {
    const last = out[out.length - 1];
    if (last && d.start < last.end) {
      if (PRIORITY[d.kind] > PRIORITY[last.kind] || (PRIORITY[d.kind] === PRIORITY[last.kind] && d.end - d.start > last.end - last.start)) out[out.length - 1] = d;
      continue;
    }
    out.push(d);
  }
  return out;
}

/** The key under which two spellings of one value share a placeholder: digits for numbers, lower-case for the rest. */
export function normalizeValue(kind: RedactKind, value: string): string {
  switch (kind) {
    case "phone":
    case "card":
    case "ssn":
      return digits(value);
    case "id":
      return digits(value).padStart(9, "0");
    case "iban":
      return value.replace(/[\s-]/g, "").toUpperCase();
    case "email":
      return value.toLowerCase();
    default:
      return value.trim().toLowerCase();
  }
}
