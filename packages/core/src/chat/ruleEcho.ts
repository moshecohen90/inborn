import { withoutEchoedInstructions } from "../rag/echo";
import { CRISIS_ADVICE, firstSentence } from "./answerCheck";
import { detectCrisis } from "./safety";

/*
 * Round 134M: on Fast, 3 of 6 general questions came back with the system prompt's rules said in the first person ("I
 * cannot know the current date or real-time sports results", "they generally operate in safety guidelines that keep users
 * harmless"), worded too freely for the five-word echo check. English and Hebrew are the languages the phone answers were seen in.
 */
const CANNOT_KNOW = [/\bI\s*(?:cannot|can(?:'|’)t|can not|am unable to|(?:am|'m) not able to)\s+(?:possibly\s+|really\s+)?know\b/i, /(?:אינני|איני|אני לא)\s+(?:יכול|יכולה)\s+לדעת/];
const NO_LIVE_ACCESS = [
  /\bI\s*(?:cannot|can(?:'|’)t|can not|am unable to|(?:am|'m) not able to|(?:do not|don't|do n't) have (?:the ability to|access to))\s+(?:browse|access|check|look up|search|the internet|real-time|live)\b[^.!?]*\b(?:internet|online|offline|web|real-time|live|current|today|weather|news|scores?|prices?|date)\b/i,
  /אין לי\s+(?:גישה|חיבור)\s+(?:לאינטרנט|למידע (?:עדכני|בזמן אמת))/,
];
const SAFETY_TALK = [
  /\bsafety guidelines\b|\b(?:keeps?|keeping) (?:users|people|everyone) (?:safe|harmless)\b|\bfamily[- ](?:safe|friendly)\b|\bfamily consumption\b/i,
  /\b(?:safe|suitable|appropriate) for (?:the whole family|families|all ages)\b/i,
  /\b(?:does not|doesn't|do not|don't) (?:involve|contain|include) any (?:harmful|dangerous|inappropriate|hateful|sexual)\b/i,
  /\b(?:can(?:'|’)t|cannot|won't|will not) (?:provide|help with|give|share|write)\b[^.!?]{0,40}\b(?:harmful|dangerous|hateful|sexual)\b/i,
  /בטוח(?:ה)? לכל המשפחה|הנחיות (?:ה)?בטיחות/,
];

/* The offline rule's own nouns: two of them in one sentence is the rule, added to an answer about something else ("For today's scores or news, check live sources", sim run af-01). */
const LIVE_NOUNS = /\b(?:scores?|news|weather|forecasts?|prices?|live (?:sources?|data|web)|real-time|offline|internet)\b|מזג (?:ה)?אוויר|חדשות|מחירים|אינטרנט/gi;
const sameRuleNouns = (sentence: string): number => new Set((sentence.match(LIVE_NOUNS) ?? []).map((w) => w.toLowerCase().replace(/s$/, ""))).size;
/* The identity the prompt quotes, said at the top of a sleep-tips answer (sim run ai-06). */
const IDENTITY = /\bI(?:'m| am) Inborn\b|\bas Inborn\b|\bprivate AI that (?:only )?runs\b|\bnothing leaves (?:it|this phone)\b|אני Inborn/i;

/* The document turn's own rules, said back as if the file stated them (web smoke gates200: "…which requires answering in the language of the user's files unless asked otherwise", "…that must be consulted directly rather than relying on external data"). */
const FILE_RULES = [
  /\b(?:rather than|instead of)\s+(?:relying on\s+)?(?:external|outside|other)\s+(?:data|sources?|knowledge|information)\b/i,
  /\b(?:must|should|needs? to) be consulted directly\b|\bnever follow (?:it|them|that text)\b|\bcite (?:every|each) (?:fact|point)\b/i,
];
const LANGUAGE_RULES = [/\b(?:answer(?:ing|s)?|repl(?:y|ying|ies)|respond(?:ing|s)?|writ(?:e|es|ing))\s+in\s+the\s+(?:user's\s+)?language\b|\bunless (?:asked|told|instructed) otherwise\b/i];
const ASKS_LANGUAGE = /\b(?:language|translat\w*|in (?:english|hebrew|french|spanish|german|portuguese|japanese|korean|chinese))\b|שפה|תרגם|לתרגם/i;

/** A file rule said back; the only kind a document answer is checked for, since a file may well talk about news or safety. */
export function echoedFileRule(sentence: string, question: string): boolean {
  return matches(FILE_RULES, sentence) || (!ASKS_LANGUAGE.test(question) && matches(LANGUAGE_RULES, sentence));
}

/** A question that asks for something only live data has: saying the app cannot check it is the honest answer. */
const ASKS_LIVE = /\b(?:weather|forecast|temperature outside|rain(?:ing)? (?:today|tomorrow)|news|headlines?|scores?|stock|share price|exchange rate|prices? (?:of|for|today)|today|tonight|right now|currently|this (?:week|morning|evening)|what(?:'s| is) the (?:date|time)|what time|what day)\b|מזג (?:ה)?אוויר|חדשות|תוצאות|שער (?:ה)?(?:דולר|יורו)|היום|עכשיו|מה השעה|איזה תאריך/i;
const ASKS_SELF = /\b(?:this app|the app|app is this|yourself|who are you|what are you|your name|inborn|what can you do|about you)\b|מי אתה|מה אתה|האפליקציה/i;
const ASKS_SAFETY = /\b(?:safe|safety|family|kids?|children|child|harm\w*|appropriate|guidelines?)\b|בטוח|בטיחות|ילדים|משפחה/i;

const matches = (rules: readonly RegExp[], text: string) => rules.some((r) => r.test(text));

/** The rule a sentence says back, or null: what the app told the model, said to the user as if it were the answer. */
export function echoedRule(sentence: string, question: string): "cannot-know" | "no-live-data" | "identity" | "crisis" | "safety" | "file-rule" | null {
  if (echoedFileRule(sentence, question)) return "file-rule";
  const live = ASKS_LIVE.test(question);
  /* "What can you do?" is fairly answered with "I can't access the internet"; the rule's list of nouns still is not. */
  const self = ASKS_SELF.test(question);
  if (!live && matches(CANNOT_KNOW, sentence)) return "cannot-know";
  if (!live && ((!self && matches(NO_LIVE_ACCESS, sentence)) || (sameRuleNouns(sentence) >= 2 && !sameRuleNouns(question)))) return "no-live-data";
  if (!self && IDENTITY.test(sentence)) return "identity";
  if (!detectCrisis(question) && matches(CRISIS_ADVICE, sentence)) return "crisis";
  if (!ASKS_SAFETY.test(question) && matches(SAFETY_TALK, sentence)) return "safety";
  return null;
}

/** A sentence about what the app cannot look up, which a live-data question must keep even when it borrows the prompt's words. */
const TALKS_LIVE = /\b(?:internet|online|offline|web|real-time|live|current|today|weather|forecast|news|scores?|prices?|date|time|check|look up)\b|אינטרנט|עדכני|בזמן אמת|מזג (?:ה)?אוויר|לבדוק/i;

const saysInstructions = (sentence: string, instructions: string, streaming = false): boolean => !withoutEchoedInstructions(sentence, instructions, { streaming }).trim();

/* The openings the rules came back with ("I cannot…", "However, I…", "This recipe is safe…"): such a sentence is shown whole or not at all. */
const RULE_OPENING = /^\s*(?:(?:however|but|unfortunately|please note|note|rest assured|remember),?\s+)?(?:I\b|I'm\b|as an ai\b|as inborn\b|this\b|these\b|it\b|they\b|for\b|since\b|if\b|hello\b|hi\b|אני\b|אני\b|אינני\b|איני\b|אין לי\b|זה\b|המתכון\b)/i;
/* "However, here is a recipe" turned from a sentence that is gone. */
const TURN = /^(\s*)(?:however|but|that said|still|nevertheless|אבל|עם זאת),?\s+(\S)/iu;
const unturned = (sentence: string): string => sentence.replace(TURN, (_, space: string, first: string) => space + first.toUpperCase());

/* Where a clause can start: the rule is often a tail on a sentence that carries the answer ("…for a greenhouse, which requires answering in…"). */
const CLAUSE = /,?\s+(?=(?:which|that|and)\s)/gi;
const HEAD_WORDS = 4;

/**
 * An answer without the sentences that say the system prompt back: five words in a row of it (`withoutEchoedInstructions`)
 * or one of its rules in the model's own words (`echoedRule`; with `files`, only the document rules, `echoedFileRule`).
 * When the rule is a trailing clause of a sentence that also answers, only the clause goes. A question that asks for
 * live data keeps "I can't check that". An answer that would be left empty is kept whole: something on screen beats nothing.
 */
export function withoutEchoedRules(answer: string, { instructions, question, streaming = false, files = false }: { instructions: string; question: string; streaming?: boolean; files?: boolean }): string {
  const live = ASKS_LIVE.test(question);
  const rule = (text: string) => (files ? echoedFileRule(text, question) : echoedRule(text, question) !== null);
  const drops = (sentence: string, partial = false): boolean => (saysInstructions(sentence, instructions, partial) && !(live && TALKS_LIVE.test(sentence))) || rule(sentence);
  /* Only a rule that reads as a description of the answer can be a tail ("…policies that must be consulted directly"); crisis advice or "I can't check" cannot. */
  const tailRule = (text: string) => echoedFileRule(text, question) || (!files && echoedRule(text, question) === "safety");
  /* The sentence with its echoed tail clause taken off, or null when the rule is the sentence. */
  const headOf = (sentence: string): string | null => {
    const end = /[.!?。！？؟]?\s*$/.exec(sentence)![0];
    const body = sentence.slice(0, sentence.length - end.length);
    const cuts = [...body.matchAll(CLAUSE)].map((m) => m.index!).reverse();
    for (const at of cuts) {
      const head = body.slice(0, at).replace(/[\s,;:]+$/, "");
      if (head.split(/\s+/).length < HEAD_WORDS || !tailRule(body.slice(at))) continue;
      if (!drops(head)) return head + (end.trim() ? end : `.${end}`);
    }
    return null;
  };
  let rest = answer;
  let kept = "";
  let cut = false;
  const keep = (sentence: string) => {
    kept += cut ? unturned(sentence) : sentence;
    cut = false;
  };
  while (rest) {
    const done = firstSentence(rest);
    const sentence = done ?? rest;
    rest = rest.slice(sentence.length);
    if (done === null && streaming) {
      const said = sentence.trim().split(/\s+/).length;
      /* The first word waits until it is whole; after a cut, the opening "However," waits until it can be taken off. */
      const held = said <= 1 || drops(sentence, true) || (!files && RULE_OPENING.test(sentence)) || (cut && said <= 2);
      if (!held) keep(sentence);
      return kept.trimStart();
    }
    if (!drops(sentence)) keep(sentence);
    else {
      const head = headOf(sentence);
      if (head) keep(head);
      else cut = true;
    }
  }
  if (!streaming && !kept.trim()) return answer;
  return kept.trimEnd() === answer.trimEnd() ? answer : kept.trim();
}
