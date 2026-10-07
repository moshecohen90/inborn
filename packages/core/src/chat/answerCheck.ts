import type { Delta, GenOpts } from "../llm/types";
import { detectCrisis } from "./safety";

/**
 * Round 131: what the app knows about a turn, checked against the answer the model wrote for it. A small model shown a
 * picture still answered "I am an AI and don't have eyes", cited "[2] image-page.pdf · p.2" from a turn with one
 * passage, or opened with "The user is asking me to answer in one to three sentences". None of these is a matter of
 * taste: the app sent the picture, knows the passages, and wrote the instructions.
 */
export interface TurnFacts {
  /** A picture went to a model that can see it. */
  pictureSent: boolean;
  /** Labels of the passages in the prompt, as `citationLabel` writes them ("report.pdf · p.1"). */
  sources: readonly string[];
  /** The system prompt: an answer that repeats it is narrating its instructions. */
  instructions: string;
  /** The user's message: an answer that quotes it whole is talking about the prompt, not answering it. */
  question?: string;
}

export type AnswerFault = "denies-sight" | "off-topic-safety" | "foreign-source" | "meta";

/* Word lists are unavoidable for a denial and for the crisis advice below; English and Hebrew are the languages the phone answers were seen in. */
const DENIES_SIGHT: readonly RegExp[] = [
  /\b(?:can(?:no|')t|cannot|can not|unable to|(?:do|does)(?: not|n't)|am not able to|'m not able to)\s+(?:physically |actually |really |directly )?(?:see|view|look at|read|access|perceive|process|analy[sz]e)\s+(?:the |this |that |your |any |an? )?(?:image|images|picture|pictures|photo|photos|it\b|what)/i,
  /\b(?:don't|do not) have (?:eyes|vision|the ability to see)/i,
  /\bno (?:image|picture|photo) (?:was |is |has been )?(?:provided|attached|shared|included)/i,
  /\bI(?:'m| am) (?:just |only )?(?:a |an )?(?:text-based |large )?(?:language )?(?:AI|model|assistant)\b[^.!?]{0,60}\b(?:see|eyes|images?|pictures?)\b/i,
  /\b(?:can(?:no|')t|cannot|unable to)\s+(?:understand|make out|recogni[sz]e|identify)\s+(?:the |this |that |your |any )?(?:image|picture|photo)s?\b/i,
  /(?:לא|אינני|איני)\s+(?:יכול|יכולה|מסוגל|מסוגלת)\s+(?:לראות|להבחין|להבין את התמונה|לקרוא את התמונה)/,
  /אין לי\s+(?:יכולות?|אפשרות)\s+(?:לראות|להבחין|לקרוא את התמונ)/,
];

/* The system prompt's crisis line, given back (often translated) to a message that says nothing of the kind. */
export const CRISIS_ADVICE: readonly RegExp[] = [
  /\b(?:someone (?:you|they) (?:trust|feel comfortable with)|crisis (?:line|hotline|center)|harm(?:ing)? (?:yourself|themselves)|self-harm)\b/i,
  /מישהו ש(?:נוח לך|אתה סומך|את סומכת|תסמוך)|קו (?:חירום|סיוע|משבר|קריאה)|לפגוע בעצמ/,
];

/* Third-person talk about the person being answered, opening a sentence, is the model reasoning about its prompt. */
const ABOUT_USER = /^[\s*_>#"“-]*(?:the user(?:'s|’s)?|this user|the (?:question|request|prompt|instructions?) (?:asks|is|says|wants)|המשתמש|השאלה של המשתמש)\b/i;

/** Consecutive words a sentence must repeat from the instructions to count as narrating them. */
export const ECHO_WORDS = 5;

const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

function echoes(sentence: string, instructions: string): boolean {
  const said = words(instructions);
  if (said.length < ECHO_WORDS) return false;
  const runs = new Set<string>();
  for (let i = 0; i + ECHO_WORDS <= said.length; i++) runs.add(said.slice(i, i + ECHO_WORDS).join(" "));
  const own = words(sentence);
  for (let i = 0; i + ECHO_WORDS <= own.length; i++) if (runs.has(own.slice(i, i + ECHO_WORDS).join(" "))) return true;
  return false;
}

/** Fewest words a question needs before quoting it whole says more than a short answer would by chance. */
export const QUOTE_WORDS = 3;

/* "I see the message is 'מה אתה רואה?' but…": the user's question set in quotes inside the answer. */
function quotesQuestion(sentence: string, question: string | undefined): boolean {
  const asked = words(question ?? "").join(" ");
  if (asked.split(" ").length < QUOTE_WORDS) return false;
  return [...sentence.matchAll(/["“”'‘’«»״„]([^"“”«»״„]{3,200})["“”'‘’«»״„]/g)].some((m) => words(m[1]!).join(" ") === asked);
}

/* A source label as the prompt writes it, "<name> · p.3" (or page/part/sheet), with or without its "[n]". */
const LABEL = /\[?\d{0,2}\]?\s*[^\s[\]·][^\n·[\]]{0,80}?\s·\s(?:part|page|p\.|sheet)\s?\d+/g;
const MARKER = /\s?\[(\d{1,2})\]/g;

const foreignMarker = (n: string, facts: TurnFacts): boolean => Number(n) < 1 || Number(n) > facts.sources.length;
/** Where the first label that names no passage of the turn starts, or -1. */
const foreignLabelAt = (text: string, facts: TurnFacts): number => [...text.matchAll(LABEL)].find((m) => !facts.sources.some((s) => m[0].endsWith(s)))?.index ?? -1;

/** One sentence without what names no passage of its turn: stray [n] marks dropped, cut where an invented label starts. */
function withoutForeign(sentence: string, facts: TurnFacts): { text: string; foreign: boolean; cut: boolean } {
  const at = foreignLabelAt(sentence, facts);
  const head = at >= 0 ? sentence.slice(0, at).trimEnd() : sentence;
  const text = head.replace(MARKER, (mark, n: string) => (foreignMarker(n, facts) ? "" : mark));
  return { text, foreign: at >= 0 || text !== head, cut: at >= 0 };
}

function deniesOrNarrates(sentence: string, facts: TurnFacts): AnswerFault | null {
  if (facts.pictureSent && DENIES_SIGHT.some((r) => r.test(sentence))) return "denies-sight";
  if (facts.question !== undefined && !detectCrisis(facts.question) && CRISIS_ADVICE.some((r) => r.test(sentence))) return "off-topic-safety";
  if (ABOUT_USER.test(sentence.replace(/^\s*(?:\[\d{1,2}\]\s*)+/, "")) || echoes(sentence, facts.instructions) || quotesQuestion(sentence, facts.question)) return "meta";
  return null;
}

/** What is wrong with one sentence of an answer, judged only by what the app knows about its turn; null when nothing is. */
export function checkSentence(sentence: string, facts: TurnFacts): AnswerFault | null {
  const mended = withoutForeign(sentence, facts);
  return deniesOrNarrates(mended.text, facts) ?? (mended.foreign ? "foreign-source" : null);
}

/** Sentences as the stream releases them; a run this long with no end is judged as one. */
export const SENTENCE_HOLD = 240;
const SENTENCE_END = /[.!?。！？؟](?=\s|$)|\n/;

/** The text up to and including its first sentence end, or null while that sentence is still being written. */
export function firstSentence(text: string, final = false): string | null {
  const m = SENTENCE_END.exec(text);
  if (m && text.slice(0, m.index + 1).trim()) {
    const end = m.index + m[0].length;
    const space = /^\s*/.exec(text.slice(end))![0].length;
    return text.slice(0, end + space);
  }
  return final || text.length >= SENTENCE_HOLD ? text : null;
}

/** The answer as `checkedAnswer` would let it through on its first attempt, and the fault that stopped it; for tests and the harness. */
export function screenAnswer(answer: string, facts: TurnFacts): { text: string; fault: AnswerFault | null } {
  let rest = answer;
  let text = "";
  let fault: AnswerFault | null = null;
  while (rest) {
    const s = firstSentence(rest, true)!;
    rest = rest.slice(s.length);
    const verdict = judge(s, facts, !text.trim());
    fault ??= verdict.fault;
    if (verdict.retry) return { text: "", fault };
    text += verdict.keep;
    if (verdict.cut) break;
  }
  return { text: text.trim() ? text : "", fault };
}

interface Verdict {
  keep: string;
  fault: AnswerFault | null;
  /** The answer's opening is at fault: ask again. */
  retry: boolean;
  /** An invented label: nothing after it is the model's own words. */
  cut: boolean;
}

function judge(sentence: string, facts: TurnFacts, opening: boolean): Verdict {
  const mended = withoutForeign(sentence, facts);
  const fault = deniesOrNarrates(mended.text, facts) ?? (mended.foreign ? "foreign-source" : null);
  const keep = fault && fault !== "foreign-source" ? "" : mended.text;
  return { keep, fault, retry: opening && !keep.trim(), cut: mended.cut };
}

/** A picture turn reads what is there; at 0.7 the small models wandered into refusals and invented scenes (round 131). */
export const PICTURE_SAMPLING: Pick<GenOpts, "temperature"> = { temperature: 0.3 };
/** The silent second attempt after a fault. */
export const PICTURE_RETRY: Pick<GenOpts, "temperature"> = { temperature: 0.1 };

export interface CheckedRun {
  /** Starts one attempt; `retry` is the silent second one. */
  start: (retry: boolean) => AsyncIterable<Delta>;
  /** Stops the attempt in flight; its stream still ends on its own and is drained before anything else starts. */
  stop: () => void;
  /** The user stopped the turn: no retry, and what was already let through stays. */
  cancelled: () => boolean;
  facts: TurnFacts;
  /** What the user reads when neither attempt gave a sound answer. */
  honest: string;
  onFault?: (fault: AnswerFault, attempt: number) => void;
  /** QA seam: every opening counts as faulty. */
  forceFault?: boolean;
}

/**
 * The answer reaches the screen a sentence at a time, each one checked first. An opening at fault is stopped unseen and
 * asked once more with cooler sampling; a later sentence at fault is left out; an invented label ends the answer where
 * it starts. When neither attempt lets a sentence through, the user gets the honest line.
 */
export async function* checkedAnswer(run: CheckedRun): AsyncIterable<Delta> {
  let done: Delta["done"];
  for (let attempt = 0; attempt < 2; attempt++) {
    let pending = "";
    let shown = "";
    let retry = false;
    let ended = false;
    const take = (sentence: string): string | null => {
      const v = run.forceFault && !shown ? { keep: "", fault: "meta" as const, retry: true, cut: false } : judge(sentence, run.facts, !shown.trim());
      if (v.fault) run.onFault?.(v.fault, attempt);
      if (v.retry && !run.cancelled()) retry = true;
      if (v.cut || retry) {
        ended = true;
        run.stop();
      }
      return v.keep || null;
    };
    for await (const d of run.start(attempt > 0)) {
      if (d.done) done = d.done;
      if (d.reasoning && attempt === 0) yield { reasoning: d.reasoning };
      if (!d.text || ended) continue;
      pending += d.text;
      for (let s = firstSentence(pending); s !== null && !ended; s = firstSentence(pending)) {
        pending = pending.slice(s.length);
        const keep = take(s);
        if (keep && !retry) {
          shown += keep;
          yield { text: keep };
        }
      }
    }
    if (pending && !ended) {
      const keep = take(pending);
      if (keep && !retry) {
        shown += keep;
        yield { text: keep };
      }
    }
    if (shown.trim() || run.cancelled()) {
      if (done) yield { done };
      return;
    }
  }
  yield { text: run.honest };
  if (done) yield { done };
}
