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

const EU_112: CrisisResource[] = [{ name: "112", phone: "112" }];

/* Each row checked 2026-10-08 against the source on its line; the EU members' 112 against https://digital-strategy.ec.europa.eu/en/policies/112 */
const EMERGENCY_BY_REGION: Record<string, CrisisResource[]> = {
  US: [{ name: "911", phone: "911" }], // https://www.fcc.gov/general/9-1-1-and-e9-1-1-services
  CA: [{ name: "911", phone: "911" }], // https://crtc.gc.ca/eng/phone/911/
  MX: [{ name: "911", phone: "911" }], // https://www.gob.mx/911/articulos/numero-unico-de-emergencias-9-1-1
  AR: [{ name: "911", phone: "911" }, { name: "SAME", phone: "107" }], // https://www.argentina.gob.ar/tema/emergencias
  GB: [{ name: "999", phone: "999" }, ...EU_112], // https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers
  IE: [...EU_112, { name: "999", phone: "999" }], // https://www.citizensinformation.ie/en/health/health-system/emergency-health-services-in-ireland/
  DE: EU_112,
  AT: EU_112,
  FR: EU_112,
  BE: EU_112,
  ES: EU_112,
  PT: EU_112,
  CH: [...EU_112, { name: "Sanität / Ambulance", phone: "144" }, { name: "Polizei / Police", phone: "117" }], // https://www.ch.ch/en/safety-and-justice/emergencies-and-danger/
  BR: [{ name: "SAMU", phone: "192" }, { name: "Polícia", phone: "190" }, { name: "Bombeiros", phone: "193" }], // https://www.agenciabrasilia.df.gov.br/w/192-ou-193-saiba-quando-acionar-o-samu-ou-o-corpo-de-bombeiros-em-situacoes-de-emergencia
  JP: [{ name: "救急・消防", phone: "119" }, { name: "警察", phone: "110" }], // https://www.jnto.go.jp/emergency/eng/mi_guide.html
  KR: [{ name: "119 구급·소방", phone: "119" }, { name: "112 경찰", phone: "112" }], // https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=140042
  TW: [{ name: "119 救護・消防", phone: "119" }, { name: "110 警察", phone: "110" }], // 110 https://www.npa.gov.tw/en/app/artwebsite/view?module=artwebsite&id=8018&serno=8de79b2b-17ff-4cfa-a9e1-7583d22b523f · 119 https://www.tyfd.gov.tw/en/index.php?code=list&ids=1228
  AU: [{ name: "Triple Zero", phone: "000" }], // https://www.infrastructure.gov.au/media-communications/phone/triple-zero
  NZ: [{ name: "111", phone: "111" }], // https://www.police.govt.nz/call-111
  IL: [{ name: "מד\"א", phone: "101" }, { name: "משטרה", phone: "100" }, { name: "כבאות", phone: "102" }], // https://www.gov.il/BlobFolder/generalpage/be-prepared-for-emergency-situations/en/9134_Emergency%20Preparedness.pdf
};

/** The region's verified emergency numbers (ambulance, police, fire); none when the region is unknown or not listed. */
export function emergencyNumbers(region: string | undefined): CrisisResource[] {
  return (region && EMERGENCY_BY_REGION[region.toUpperCase()]) || [];
}

/** What the safety card lists: the region's crisis lines, then its emergency numbers. */
export function helpResources(region: string | undefined): CrisisResource[] {
  return [...crisisResources(region), ...emergencyNumbers(region)];
}

const VERIFIED_DIGITS = new Set([...Object.values(BY_REGION).flat(), ...INTERNATIONAL].map((r) => r.phone.replace(/\D/g, "")));

const LATIN_CONTACT = [
  "crisis", "hotline", "helpline", "help line", "lifeline", "emergenc", "suicid", "samaritan", "ambulance", "poison control", "police", "self-harm",
  "hurt herself", "hurt himself", "hurt themselves", "hurt yourself", "harm herself", "harm himself", "harm themselves", "harm yourself",
  "emergência", "crise", "cvv", "linha de", "ambulância", "polícia", "línea de", "ambulancia", "policía",
  "urgence", "ligne d'écoute", "samu", "pompiers", "krise", "notruf", "notfall", "seelsorge", "suizid", "krankenwagen", "polizei",
];
const OTHER_CONTACT = ["חירום", "קו חם", "קו סיוע", "ער\"ן", "התאבד", "מד\"א", "משטרה", "緊急", "救急", "いのちの電話", "ホットライン", "相談窓口", "自殺", "警察", "위기", "긴급", "응급", "상담전화", "핫라인", "자살", "경찰", "危機", "危机", "紧急", "急救", "熱線", "热线", "專線", "专线", "自杀"];
const CONTACT = new RegExp(`(?<!\\p{L})(?:${LATIN_CONTACT.join("|")})|${OTHER_CONTACT.join("|")}`, "iu");
/* Units after a number mean a quantity ("7 hours", "65-68°F"), never a line to call; "988-555-FREEDOM" is a number spelled in letters. */
const PHONE = /\+?\(?\d[\d ().-]*\d(?:-[A-Z]{3,})?(?!\d|\s*(?:%|°|º|h\b|hours?|hrs?|min|minutes?|mg|ml|kg|years?|days?|weeks?|am\b|pm\b))/gu;
const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s/;
const SENTENCE_END = /(?<=[.!?。！？])\s+/u;

const digitsOf = (token: string) => token.replace(/\D/g, "");

function phonesIn(text: string): string[] {
  return [...text.matchAll(PHONE)]
    .map((m) => m[0])
    .filter((token) => {
      const digits = digitsOf(token).length;
      if (digits > 15 || digits < 3) return false;
      return digits >= 7 || /[A-Z]{3}$/.test(token) || !/[.-]/.test(token);
    });
}

/** A turn about crisis or emergency help: in the answer, or in the question it answers. */
const talksContact = (text: string, question: string): boolean => CONTACT.test(text) || CONTACT.test(question) || detectCrisis(question);

/** Numbers to call that the model wrote itself: not on the verified list, not given by the user. */
/* Only the device region's emergency numbers are kept: the model cannot know where the user is, so 911 is wrong in Germany. */
const madeUp = (text: string, question: string, region: string | undefined): string[] => {
  const kept = new Set([...phonesIn(question), ...emergencyNumbers(region).map((r) => r.phone)].map(digitsOf));
  return phonesIn(text).filter((p) => !VERIFIED_DIGITS.has(digitsOf(p)) && !kept.has(digitsOf(p)));
};

/** Phone numbers a model wrote in a turn about crisis or emergency help that are not on the app's verified lists for `region` (F-134N-1). */
export function crisisNumbersIn(text: string, question = "", region?: string): string[] {
  return talksContact(text, question) ? madeUp(text, question, region) : [];
}

/**
 * The answer without the sentences that give a model-made crisis or emergency number, and without a heading left with
 * nothing under it; the app's own card shows verified numbers instead. While streaming, an unfinished sentence holding
 * a number waits until it can be judged.
 */
export function withoutCrisisNumbers(text: string, { streaming = false, question = "", region }: { streaming?: boolean; question?: string; region?: string | undefined } = {}): string {
  const contact = talksContact(text, question);
  if (!contact && !streaming) return text;
  const lines = text.split("\n");
  const last = lines.length - 1;
  const drop = new Set<number>();
  let changed = false;
  const kept = lines.map((line, i) => {
    const sentences = line.split(SENTENCE_END);
    const out = sentences.filter((sentence, k) => !(contact && madeUp(sentence, question, region).length) && !(streaming && i === last && k === sentences.length - 1 && /\d{3}/.test(sentence)));
    if (out.length === sentences.length) return line;
    changed = true;
    if (!out.join("").trim()) drop.add(i);
    return out.join(" ");
  });
  if (!changed) return text;
  for (let i = 0; i < lines.length; i++) {
    if (drop.has(i) || !/[:：]\s*\**\s*$/.test(kept[i]!)) continue;
    let j = i + 1;
    while (j < lines.length && (!lines[j]!.trim() || LIST_ITEM.test(lines[j]!))) j++;
    const items = [...Array(j - i - 1).keys()].map((k) => i + 1 + k).filter((k) => lines[k]!.trim());
    if (items.length && items.every((k) => drop.has(k))) drop.add(i);
  }
  return kept
    .filter((_, i) => !drop.has(i))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
