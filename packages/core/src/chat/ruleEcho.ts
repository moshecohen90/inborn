import { withoutEchoedInstructions } from "../rag/echo";
import { firstSentence } from "./answerCheck";
import { IDENTITY_LINE } from "./personas";

/*
 * Round 134M: the system prompt's rules as the phones said them back, word for word or nearly (build 40, build 41 J7,
 * the simulator's before runs). Only these exact shapes: a looser paraphrase rule cut "contact your pediatrician or a
 * crisis hotline like 988" from sleep tips.
 */
const KNOWN_ECHOES = [
  /\bI\s*(?:cannot|can(?:'|’)t|can not)\s+know\s+(?:the\s+)?(?:current|today's|real-time|specific context)\b/i,
  /\bI\s*(?:cannot|can(?:'|’)t|can not)\s+identify this specific app\b/i,
  /\bsafety guidelines that keep (?:users|people) (?:safe|harmless)\b/i,
  /\bsafe for family consumption\b/i,
  /\bI(?:'m| am| stay| keep (?:it|things)| remain) family[- ](?:safe|friendly)\b/i,
];
/* Round 134M2: rule words a model pins onto an answer that is otherwise fine ("a simple, family-friendly pancake recipe", "…ideas within my safety guidelines"): only the words go. */
const RULE_WORDS = [/,?\s*family[- ](?:friendly|safe)(?=\s+(?:pancake\s+)?(?:content|recipes?|ideas?|messages?|answers?|text|stor(?:y|ies)|meals?|versions?|options?|activit(?:y|ies)|jokes?)\b)/gi, /\s+within (?:my|the|our) safety guidelines\b/gi];
const ASKS_FAMILY = /\b(?:family|kids?|child(?:ren)?|toddlers?|safe|guidelines?)\b/i;
/* The base model and its maker, which Instant gave as its own (sim ai3-08 "I am Qwen3.5, trained by Alibaba Cloud to assist…"): the app has one name. */
const BASE_MAKER = /,?\s*(?:an? (?:large )?(?:language )?(?:model|AI(?: model)?)\s+)?(?:(?:developed|trained|created|made|built)\s+by|from)\s+(?:the\s+)?(?:(?:Alibaba(?: Cloud| Group)?(?:'s|’s)?\s+)?(?:Tongyi(?: Lab)?|Qwen team)|Alibaba(?: Cloud| Group)?)(?=(\s+to\b)?)/gi;
const BASE_NAME = /\bTongyi Qianwen\b|\bQwen(?:[\w-]|\.(?=\w))*|通义千问/gi;
const ASKS_BASE = /\b(?:qwen|alibaba|tongyi)\b/i;

/** The answer with the base model's name and maker said as ours, and rule words taken off the sentences they were pinned to. */
export function unbranded(answer: string, question: string): string {
  let text = answer;
  if (!ASKS_BASE.test(question)) text = text.replace(BASE_MAKER, (_, to?: string) => (to ? ", built" : "")).replace(BASE_NAME, "Inborn");
  if (!ASKS_FAMILY.test(question)) for (const words of RULE_WORDS) text = text.replace(words, "");
  return text;
}
/* Build 40's "…as I do not have access to browse the internet", on a recipe; a fair answer to "what can you do?". */
const BROWSE_ECHO = /\bI\s*(?:cannot|can(?:'|’)t|can not|am unable to|do not have access to|don't have access to)\s+browse (?:the\s+)?(?:live\s+)?(?:internet|web)\b/i;
/* Our own identity, pasted onto an answer about something else (sim run ai-06: sleep tips that opened with it). */
const IDENTITY = /\bI(?:'m| am) Inborn\b|\bas Inborn\b|\bnothing leaves (?:it|this phone)\b/i;
/* Help a person may need is never cut, whatever it repeats. */
const LIFELINE = /\+?\d[\d\s().-]{6,}\d|\b(?:hotline|helpline|doctor|pediatrician|paediatrician|physician|emergency|911|988|999|112|101)\b|רופא|חירום|מוקד/i;

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

const matches = (rules: readonly RegExp[], text: string) => rules.some((r) => r.test(text));

/** The rule a sentence says back, or null: what the app told the model, said to the user as if it were the answer. */
export function echoedRule(sentence: string, question: string): "known-echo" | "identity" | "file-rule" | null {
  if (echoedFileRule(sentence, question)) return "file-rule";
  const self = ASKS_SELF.test(question);
  if (!ASKS_LIVE.test(question) && (matches(KNOWN_ECHOES, sentence) || (!self && BROWSE_ECHO.test(sentence)))) return "known-echo";
  if (!self && IDENTITY.test(sentence)) return "identity";
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
export function withoutEchoedRules(given: string, { instructions, question, streaming = false, files = false }: { instructions: string; question: string; streaming?: boolean; files?: boolean }): string {
  /* A file may well name Alibaba or a family-friendly recipe; only a general answer is unbranded. */
  const answer = files ? given : unbranded(given, question);
  /* "Tell me about yourself" is fairly answered with "I'm offline, no live news", even in the prompt's words. */
  const live = ASKS_LIVE.test(question) || ASKS_SELF.test(question);
  /* The identity is stated to be said back when asked; off-topic it is the `identity` rule's to judge. */
  const rules = instructions.replace(IDENTITY_LINE, " ");
  const rule = (text: string) => (files ? echoedFileRule(text, question) : echoedRule(text, question) !== null);
  const drops = (sentence: string, partial = false): boolean =>
    !LIFELINE.test(sentence) && ((saysInstructions(sentence, rules, partial) && !(live && TALKS_LIVE.test(sentence))) || rule(sentence));
  /* Only a rule that reads as a description of the answer can be a tail ("…policies that must be consulted directly", "…and they operate in safety guidelines that keep users harmless"). */
  const tailRule = (text: string) => echoedFileRule(text, question) || (!files && echoedRule(text, question) === "known-echo");
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
