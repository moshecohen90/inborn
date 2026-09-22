/** Crisis-language detection on the device (§8.2 S14, §10.5 #37): a small per-language phrase list, never a network call. */

const PHRASES: Record<string, readonly string[]> = {
  en: ["kill myself", "end my life", "take my own life", "want to die", "don't want to live anymore", "suicide", "suicidal", "self-harm", "self harm", "hurt myself", "cut myself", "no reason to live", "better off dead"],
  he: ["להתאבד", "התאבדות", "אובדני", "לשים קץ לחיי", "רוצה למות", "לא רוצה לחיות", "לפגוע בעצמי", "לחתוך את עצמי", "אין לי סיבה לחיות"],
  es: ["suicidarme", "quitarme la vida", "acabar con mi vida", "quiero morir", "no quiero vivir", "hacerme daño"],
  fr: ["me suicider", "mettre fin à mes jours", "en finir avec la vie", "envie de mourir", "je veux mourir", "me faire du mal"],
  de: ["mich umbringen", "selbstmord", "mir das leben nehmen", "sterben will", "will sterben", "will nicht mehr leben", "mich verletzen"],
  pt: ["me matar", "tirar minha vida", "acabar com a minha vida", "quero morrer", "não quero mais viver", "me machucar"],
  ja: ["自殺", "死にたい", "死のう", "消えたい", "自傷"],
  ko: ["자살", "죽고 싶", "죽고싶", "살고 싶지 않", "자해", "목숨을 끊", "사라지고 싶"],
  "zh-Hant": ["自殺", "自杀", "想死", "不想活", "自殘", "結束生命", "了結自己"],
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
  NZ: [{ name: "Need to Talk?", phone: "1737" }],
  DE: [{ name: "Telefonseelsorge", phone: "08001110111" }],
  AT: [{ name: "Telefonseelsorge", phone: "142" }],
  CH: [{ name: "Die Dargebotene Hand", phone: "143" }],
  BE: [{ name: "Zelfmoordlijn", phone: "1813" }, { name: "Centre de Prévention du Suicide", phone: "080032123" }],
  FR: [{ name: "3114", phone: "3114" }],
  ES: [{ name: "024", phone: "024" }],
  BR: [{ name: "CVV", phone: "188" }],
  PT: [{ name: "SOS Voz Amiga", phone: "213544545" }],
  JP: [{ name: "よりそいホットライン", phone: "0120279338" }],
  /* 109 replaced 129 and 1393 in 2024 and 1577-0199 is no longer published; only lines findahelpline.com still lists ship here. */
  KR: [
    { name: "자살예방 상담전화 109", phone: "109" },
    { name: "한국생명의전화", phone: "15889191" },
  ],
  TW: [
    { name: "安心專線", phone: "1925" },
    { name: "生命線協談專線", phone: "1995" },
  ],
  HK: [{ name: "撒瑪利亞防止自殺會", phone: "23892222" }],
  MX: [{ name: "Línea de la Vida", phone: "8009112000" }],
  IN: [{ name: "Tele-MANAS", phone: "14416" }],
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
