/** Crisis-language detection on the device (§8.2 S14, §10.5 #37): a small per-language phrase list, never a network call. */

const PHRASES: Record<string, readonly string[]> = {
  en: ["kill myself", "end my life", "want to die", "suicide", "suicidal", "self-harm", "self harm", "hurt myself", "cut myself", "no reason to live", "better off dead"],
  he: ["להתאבד", "התאבדות", "אובדני", "לשים קץ לחיי", "רוצה למות", "לפגוע בעצמי", "לחתוך את עצמי", "אין לי סיבה לחיות"],
  es: ["suicidarme", "quitarme la vida", "quiero morir", "hacerme daño"],
  fr: ["me suicider", "mettre fin à mes jours", "envie de mourir", "me faire du mal"],
  de: ["mich umbringen", "selbstmord", "sterben will", "mich verletzen"],
  pt: ["me matar", "tirar minha vida", "quero morrer", "me machucar"],
  ja: ["自殺", "死にたい", "自傷"],
  ar: ["انتحار", "أريد أن أموت", "أؤذي نفسي"],
  ru: ["покончить с собой", "самоубийство", "хочу умереть"],
};

export function detectCrisis(text: string): boolean {
  const t = text.toLowerCase();
  for (const list of Object.values(PHRASES)) for (const p of list) if (t.includes(p)) return true;
  return false;
}

export interface CrisisResource {
  name: string;
  /** Dialable number; the UI opens the dialer, nothing else. */
  phone: string;
}

const BY_REGION: Record<string, CrisisResource[]> = {
  IL: [{ name: "ער\"ן", phone: "1201" }],
  US: [{ name: "988 Suicide & Crisis Lifeline", phone: "988" }],
  CA: [{ name: "988 Suicide Crisis Helpline", phone: "988" }],
  GB: [{ name: "Samaritans", phone: "116123" }],
  IE: [{ name: "Samaritans", phone: "116123" }],
  AU: [{ name: "Lifeline", phone: "131114" }],
  DE: [{ name: "Telefonseelsorge", phone: "08001110111" }],
  FR: [{ name: "3114", phone: "3114" }],
  ES: [{ name: "024", phone: "024" }],
  BR: [{ name: "CVV", phone: "188" }],
  JP: [{ name: "よりそいホットライン", phone: "0120279338" }],
  MX: [{ name: "Línea de la Vida", phone: "8009112000" }],
};

const INTERNATIONAL: CrisisResource[] = [
  { name: "988 (US/CA)", phone: "988" },
  { name: "Samaritans (UK/IE)", phone: "116123" },
  { name: "ער\"ן (IL)", phone: "1201" },
];

/** Hotlines for a region code (ISO 3166-1 alpha-2); a short international list when unknown. */
export function crisisResources(region: string | undefined): CrisisResource[] {
  return (region && BY_REGION[region.toUpperCase()]) || INTERNATIONAL;
}
