/**
 * Placeholders and their mapping. A session belongs to one chat and lives in RAM only: the model sees "[EMAIL-1]",
 * the screen can show the original again, and closing the chat forgets the link between the two.
 */
import { detect, normalizeValue, type DetectOptions, type Detection, type RedactKind } from "./detect";

export const PLACEHOLDER_LABEL: Record<RedactKind, string> = { email: "EMAIL", phone: "PHONE", card: "CARD", iban: "IBAN", id: "ID", ssn: "SSN", name: "NAME", date: "DATE" };

const LABEL_KIND: Record<string, RedactKind> = Object.fromEntries(Object.entries(PLACEHOLDER_LABEL).map(([k, v]) => [v, k as RedactKind]));

/** "[EMAIL-1]" as the model may echo it back: any bracket, optional space or dash, any case. */
const PLACEHOLDER = /[[［【⟨〈(]\s*(EMAIL|PHONE|CARD|IBAN|ID|SSN|NAME|DATE)\s*[-–_ ]?\s*(\d{1,3})\s*[\]］】⟩〉)]/giu;

export interface RedactResult {
  text: string;
  detections: Detection[];
  /** Placeholders used in this text, in order of first appearance. */
  placeholders: string[];
  counts: Partial<Record<RedactKind, number>>;
}

export class RedactionSession {
  private readonly originals = new Map<string, string>();
  private readonly keys = new Map<string, string>();
  private readonly counters: Partial<Record<RedactKind, number>> = {};

  get size(): number {
    return this.originals.size;
  }

  /** The same value (in any spelling) always gets the placeholder it got the first time. */
  placeholderFor(kind: RedactKind, value: string): string {
    const key = `${kind}:${normalizeValue(kind, value)}`;
    const known = this.keys.get(key);
    if (known) return known;
    const n = (this.counters[kind] = (this.counters[kind] ?? 0) + 1);
    const placeholder = `[${PLACEHOLDER_LABEL[kind]}-${n}]`;
    this.keys.set(key, placeholder);
    this.originals.set(placeholder.toUpperCase(), value);
    return placeholder;
  }

  redact(text: string, opts: DetectOptions = {}): RedactResult {
    const detections = detect(text, opts);
    let out = "";
    let at = 0;
    const placeholders: string[] = [];
    const counts: Partial<Record<RedactKind, number>> = {};
    for (const d of detections) {
      const p = this.placeholderFor(d.kind, d.value);
      out += text.slice(at, d.start) + p;
      at = d.end;
      if (!placeholders.includes(p)) placeholders.push(p);
      counts[d.kind] = (counts[d.kind] ?? 0) + 1;
    }
    out += text.slice(at);
    return { text: out, detections, placeholders, counts };
  }

  /** Puts the originals back wherever the text (a question or an answer) carries a known placeholder. */
  reveal(text: string): string {
    if (!this.originals.size) return text;
    return text.replace(PLACEHOLDER, (m, label: string, n: string) => this.originals.get(`[${label.toUpperCase()}-${Number(n)}]`) ?? m);
  }

  /** True when the text still refers to something this session redacted. */
  mentions(text: string): boolean {
    PLACEHOLDER.lastIndex = 0;
    for (const m of text.matchAll(PLACEHOLDER)) if (this.originals.has(`[${m[1]!.toUpperCase()}-${Number(m[2])}]`)) return true;
    return false;
  }

  entries(): { placeholder: string; kind: RedactKind; value: string }[] {
    return [...this.originals.entries()].map(([placeholder, value]) => ({ placeholder, kind: LABEL_KIND[placeholder.slice(1, placeholder.indexOf("-"))] ?? "name", value }));
  }
}

/** One-shot: detect and replace with a fresh session (no reveal afterwards). */
export function redactText(text: string, opts: DetectOptions = {}): RedactResult {
  return new RedactionSession().redact(text, opts);
}

/** Pasted text above this length gets the "redact first?" offer on the composer. */
export const PASTE_OFFER_CHARS = 300;
