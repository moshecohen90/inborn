import { ECHO_WORDS, firstSentence } from "../chat/answerCheck";
import type { Message } from "../llm/types";

const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/* A quoted sentence is one the model is told to say, so only the words around the quotes count as instructions. */
const unquoted = (instructions: string): string => instructions.replace(/"[^"\n]*"/g, " ");

function instructionRuns(instructions: string): Set<string> {
  const said = words(unquoted(instructions));
  const runs = new Set<string>();
  for (let i = 0; i + ECHO_WORDS <= said.length; i++) runs.add(said.slice(i, i + ECHO_WORDS).join(" "));
  return runs;
}

const echoes = (sentence: string, runs: Set<string>): boolean => {
  const own = words(sentence);
  for (let i = 0; i + ECHO_WORDS <= own.length; i++) if (runs.has(own.slice(i, i + ECHO_WORDS).join(" "))) return true;
  return false;
};

/* While a sentence is still being written, its opening words matching the instructions is enough to hold it back. */
const mayEcho = (partial: string, runs: Set<string>): boolean => {
  const own = words(partial);
  /* The last word may be half written. */
  if (own.length > ECHO_WORDS) return echoes(own.slice(0, -1).join(" "), runs);
  const head = own.join(" ");
  return !!head && [...runs].some((r) => r.startsWith(head));
};

/** The system prompt of a built prompt, the instructions an answer must never repeat. */
export const systemOf = (messages: readonly Message[]): string => (messages[0]?.role === "system" ? messages[0].content : "");

/**
 * The answer without the sentences that repeat its own instructions: a small model ended a not-found reply with "If you
 * do not know the answer for sure, stop after that sentence." (build 39, J9-20). Sentences the instructions quote for the
 * model to say stay. Streaming, an unfinished sentence that so far reads like the instructions is held back.
 */
export function withoutEchoedInstructions(answer: string, instructions: string, opts: { streaming?: boolean } = {}): string {
  const runs = instructionRuns(instructions);
  if (!runs.size) return answer;
  let rest = answer;
  let kept = "";
  while (rest) {
    const done = firstSentence(rest);
    const sentence = done ?? rest;
    rest = rest.slice(sentence.length);
    if (done === null && opts.streaming) return mayEcho(sentence, runs) ? kept : kept + sentence;
    if (!echoes(sentence, runs)) kept += sentence;
  }
  return kept.trimEnd() === answer.trimEnd() ? answer : kept.trimEnd();
}
