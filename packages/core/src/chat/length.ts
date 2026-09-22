import type { UseCase } from "../catalog/types";

/**
 * How long an answer should be (§10.5 #39, F38). A 0.8B model asked "What is 2 plus 2?" will happily spend its whole
 * budget on the question, so every turn now carries both halves of an answer length: one line in the system prompt and
 * a token cap for that turn. The model is never re-run or rewritten; only the request is shaped.
 */
export type AnswerLength = "spoken" | "short" | "moderate" | "long";

/** The most any single answer may predict; every cap below is clamped to it. */
export const ANSWER_CEILING = 1024;
/** Power saving (§6.5) lowers the ceiling for the whole device; the guard applies it over whatever a turn asked for. */
export const SAVING_CEILING = 512;
/** A spoken turn is waited out with the microphone open, so it never gets the typed budget. */
export const SPOKEN_CEILING = 320;

export const LENGTH_TOKENS: Record<AnswerLength, number> = { spoken: 160, short: 224, moderate: 512, long: ANSWER_CEILING };

export const LENGTH_INSTRUCTIONS: Record<AnswerLength, string> = {
  spoken: "Answer in one or two short spoken sentences and stop.",
  short: "Answer in one to three sentences: give the answer first, then stop. Do not restate the question, list alternatives, or add examples unless you are asked for them.",
  moderate: "Keep the answer as short as the question allows, a paragraph at most, and stop once it is answered. Do not repeat yourself and do not pad.",
  long: "Give the whole answer the task needs, then stop. Do not repeat yourself and do not pad.",
};

/** The length each use starts from, before the shape of the prompt is read. */
export const USE_LENGTH: Record<UseCase, AnswerLength> = {
  chat: "moderate",
  math: "moderate",
  documents: "moderate",
  voice: "spoken",
  writing: "long",
  summarize: "long",
  translate: "long",
  code: "long",
};

/** Uses a short prompt may shorten. A draft or a translation is as long as the work, however briefly it was asked for. */
const SHAPED: readonly UseCase[] = ["chat", "math", "documents"];

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1 };

/* Unit words of the eight shipped locales plus Hebrew, so "in about 200 words" is caught however it is written. Any
   other language still reaches the shape rules below, which count and look for a question mark instead of reading. */
const WORD_UNITS = "words?|wörter|wort|worte|palabras?|mots?|palavras?|単語|語|단어|字|词|מילים|מילה";
const SENTENCE_UNITS = "sentences?|sätze|satz|frases?|phrases?|文|문장|句子|句|משפטים|משפט";
const PARAGRAPH_UNITS = "paragraphs?|absätze|absatz|párrafos?|paragraphes?|parágrafos?|段落|문단|פסקאות|פסקה";
const countRe = (units: string) => new RegExp(`(?:^|[^\\w])(\\d{1,4}|${Object.keys(NUMBER_WORDS).join("|")})[\\s-]{0,3}(?:${units})`, "i");
const COUNT_RES: readonly (readonly [RegExp, number])[] = [
  [countRe(WORD_UNITS), 1],
  [countRe(SENTENCE_UNITS), 25],
  [countRe(PARAGRAPH_UNITS), 80],
];

/* Asked for more or for less, in the languages we can check; an unlisted one lands on `moderate`, never on a clipped answer. */
const LONG_MARKS =
  /\b(?:detailed|in detail|in depth|in-depth|comprehensive|thorough|elaborate|at length|explain fully|as much detail|everything you know|long (?:answer|essay|article|letter|post|version|reply))\b|ausführlich|detailliert|detallad|en detalle|détaillé|en détail|detalhad|詳しく|詳細に|자세히|상세히|详细|בפירוט|מפורט|בהרחבה/i;
const SHORT_MARKS =
  /\b(?:briefly|brief answer|concise(?:ly)?|in short|short answer|one sentence|in one line|one word|in a word|tl;?dr|just the answer|quick answer)\b|kurz gefasst|in kürze|brevemente|en breve|brièvement|en bref|resumidamente|手短に|簡潔に|간단히|간략히|简短|בקצרה|בקיצור/i;

/* A drafted document is as long as the document, not as long as the sentence that asked for it (scenario iii). */
const DRAFT_VERBS = /\b(?:write|draft|compose|rewrite|craft)\b|schreib|verfass|entwirf|escrib|redact|redacta|écri|rédig|escrev|redij|書いて|作成|작성|써줘|撰写|写一|写封|כתוב|תכתוב|כתבי|נסח/i;
const DRAFT_NOUNS =
  /\b(?:letter|e-?mail|message|memo|note|essay|article|blog|post|story|poem|song|speech|report|proposal|resume|cv|itinerary|recipe|announcement|invitation|complaint|review|readme|cover letter)\b|brief|mail|aufsatz|bericht|nachricht|carta|correo|ensayo|informe|mensaje|lettre|courriel|essai|rapport|mensagem|redação|relatório|手紙|メール|作文|편지|이메일|보고서|信|邮件|文章|מכתב|מייל|הודעה|חיבור|דוח/i;
const TRANSLATE_MARKS = /\btranslat(?:e|ion)\b|übersetz|traduc|traduz|traduis|翻訳|번역|翻译|תרגם|תרגמי|לתרגם/i;

/* F39: an explanatory ask — a how-to, a reason, a comparison, a procedure — is one line long but its answer is not, so it
   must not be shortened by the counting rule below. Three small tables in the eight shipped locales plus Hebrew. */

/* Latin-script question words that only open a sentence, so they are read at the start (after any opening punctuation)
   and never mid-line, where "why" and "como" are ordinary words. */
const EXPLAIN_STARTS =
  /^[\s¿¡"'‘’“”«»([-]*(?:how (?:do|to|does|can|should|would|did)\b|why (?:do|does|is|are|did|was|were|can|would|should)\b|wie\b|warum\b|wieso\b|weshalb\b|comment\b|pourquoi\b|cómo\b|como\b|por\s?qué\b|por\s?que\b|porque\b)/i;
/* The few openings of those same question words that really are one-liners, so they keep the short plan. */
const EXPLAIN_NOT =
  /^[\s¿¡"'‘’“”«»([-]*(?:how (?:much|many|old|far|long|tall|big|heavy)\b|wie (?:viel|viele|alt|hoch|spät|weit|lange|heißt|teuer)\b|(?:cómo|como) se llama\b|comment (?:s'appelle|vous appelez)|como se chama\b)/i;
/* Said anywhere in the line. Japanese, Korean and Chinese put the question word mid-sentence ("Macでどうやって…"), and
   Hebrew needs a letter guard because "למה" is also the tail of ordinary words such as "שלמה". */
const EXPLAIN_MARKS =
  /\b(?:explain|explanation|walk me through|step by step|steps to|tell me about|what happens (?:if|when)|(?:what|which) is the difference|what's the difference|difference between|compare\b|comparison between|pros and cons|advantages and disadvantages|how it works|how does it work)\b|erklär|unterschied zwischen|vergleich|vor- und nachteile|schritte\b|explica|explíca|explíquem|diferencia entre|compara\b|ventajas y desventajas|pasos para|expliqu|différence entre|compare[rz]\b|avantages et inconvénients|étapes\b|explique|diferença entre|vantagens e desvantagens|passos para|etapas para|どうやって|どのように|どうして|なぜ|説明して|教えて|違いは|手順|比較|方法を|어떻게|왜\s|설명해|설명 좀|차이(?:는|가)|단계|비교|방법을|如何|怎麼|怎样|怎樣|為什麼|为什么|為何|解釋|解释|說明一下|说明一下|差別|区別|區別|步驟|優缺點|(?:^|[^א-ת])(?:איך|כיצד|למה|מדוע|תסביר|הסבר|להסביר|שלבים)|מה ההבדל|ההבדל בין|ספר לי על|מה קורה אם|יתרונות וחסרונות/i;
/* "Should I rent or buy?" — a choice, not a fact. */
const CHOICE_MARK = /\bshould i\b[^?]*\bor\b/i;

/** A question mark in every script the app is likely to meet. */
const QUESTION_MARK = /[?？؟¿]/;

export interface ExplicitLength {
  kind: "count" | "long" | "short";
  /** Words the user asked for; sentences and paragraphs are converted to words. */
  words?: number;
}

const numberOf = (raw: string): number | null => {
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return n > 0 ? n : null;
  }
  return NUMBER_WORDS[raw.toLowerCase()] ?? null;
};

/** What the user said about length themselves. It beats every heuristic below. */
export function detectExplicitLength(text: string): ExplicitLength | null {
  for (const [re, perUnit] of COUNT_RES) {
    const m = re.exec(text);
    const n = m?.[1] ? numberOf(m[1]) : null;
    if (n !== null) return { kind: "count", words: n * perUnit };
  }
  if (LONG_MARKS.test(text)) return { kind: "long" };
  if (SHORT_MARKS.test(text)) return { kind: "short" };
  return null;
}

/** "Write me a letter …", "translate this": work whose length belongs to the work, not to the request. */
export const isDraftAsk = (text: string): boolean => (DRAFT_VERBS.test(text) && DRAFT_NOUNS.test(text)) || TRANSLATE_MARKS.test(text);

const wordsIn = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * A short factual ask: a question that fits on a line, or a phrase too short to be asking for an essay. It counts,
 * it does not read, so a Hebrew, Japanese or Korean question is judged exactly like an English one.
 */
export function isShortAsk(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (QUESTION_MARK.test(t) && (wordsIn(t) <= 16 || t.length <= 60)) return true;
  return wordsIn(t) <= 8 && t.length <= 48;
}

/**
 * "How do I set up SSH keys on my Mac?" is one line and a question, so the counting rule above calls it short — and a
 * how-to answered in three sentences is not an answer (F39). Such a turn keeps its use's own length instead.
 */
export function isExplanatoryAsk(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (EXPLAIN_NOT.test(t)) return false;
  return EXPLAIN_STARTS.test(t) || EXPLAIN_MARKS.test(t) || CHOICE_MARK.test(t);
}

export interface LengthSignals {
  /** The user's turn this answer replies to. */
  text: string;
  /** What `detectUse` made of that turn. */
  use: UseCase;
  /** Hands-free: the answer is read aloud while the loop waits, so it stays shorter than any typed one. */
  spoken?: boolean;
  /** "Continue" on a stopped answer: the user asked for the rest, so the turn gets the ceiling. */
  continuing?: boolean;
  /** The cap the device guard allows right now; the plan never asks for more. */
  ceiling?: number;
}

export interface AnswerLengthPlan {
  length: AnswerLength;
  /** Tokens this one turn may predict. */
  maxTokens: number;
  /** One line appended to the system prompt, last, so it sits nearest the question. */
  instruction: string;
  /** True when the user named the length and the heuristic did not decide it. */
  explicit: boolean;
}

/** The length policy for one turn: what to tell the model, and how many tokens to let it spend. */
export function planAnswerLength(s: LengthSignals): AnswerLengthPlan {
  const ceiling = Math.max(1, Math.min(s.ceiling ?? ANSWER_CEILING, ANSWER_CEILING));
  const explicit = s.continuing ? null : detectExplicitLength(s.text);
  let length: AnswerLength;
  let tokens: number;
  let instruction: string;
  if (explicit?.kind === "count" && explicit.words !== undefined) {
    const w = explicit.words;
    length = w <= 60 ? "short" : w <= 250 ? "moderate" : "long";
    /* Three tokens a word, so a dense script or a wordy model still lands the length the user named instead of being cut. */
    tokens = Math.max(160, w * 3 + 64);
    instruction = `${LENGTH_INSTRUCTIONS[length]} The user asked for about ${w} words; match that length.`;
  } else if (explicit?.kind === "long" || s.continuing) {
    length = "long";
    tokens = ANSWER_CEILING;
    instruction = LENGTH_INSTRUCTIONS.long;
  } else if (explicit?.kind === "short") {
    length = "short";
    tokens = LENGTH_TOKENS.short;
    instruction = LENGTH_INSTRUCTIONS.short;
  } else {
    const base = s.spoken ? "spoken" : isDraftAsk(s.text) ? "long" : USE_LENGTH[s.use];
    const shortenable = base !== "spoken" && SHAPED.includes(s.use) && !isDraftAsk(s.text) && !isExplanatoryAsk(s.text);
    length = shortenable && isShortAsk(s.text) ? "short" : base;
    tokens = LENGTH_TOKENS[length];
    instruction = LENGTH_INSTRUCTIONS[length];
  }
  if (s.spoken) {
    tokens = Math.min(tokens, SPOKEN_CEILING);
    if (length !== "spoken") instruction = `${instruction} ${LENGTH_INSTRUCTIONS.spoken}`;
  }
  return { length, maxTokens: Math.min(Math.round(tokens), ceiling), instruction, explicit: explicit !== null };
}
