/**
 * Prompt injection through documents (spec §10.4 #34, S12): documents are data, not instructions.
 * Three layers: invisible/override characters are dropped at index time (text.ts), instruction-like lines are
 * removed from what the model sees (kept in the stored chunk so the user can still read them), and the remaining
 * text is fenced with a per-request nonce the system prompt names.
 */

const INSTRUCTION_LINE: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|any|your|the)\b.{0,40}\b(instructions?|prompts?|rules?|guidelines?|context)\b/i,
  /\b(new|updated|real|actual|true|hidden|secret)\s+(instructions?|system\s*prompt|rules?)\b/i,
  /\b(you are now (a|an|the|my|no longer)|from now on|act as (a|an|the|my|if you)|pretend (to be|you are)|roleplay as|assume the role)\b/i,
  /\b(do not|don't|never)\s+(tell|reveal|mention|inform|show)\b.{0,30}\b(user|human|anyone)\b/i,
  /\b(system|developer|assistant)\s*(prompt|message|instructions?)\s*:/i,
  /^\s*(system|assistant|user|developer|human|ai)\s*:/i,
  /\b(print|reveal|repeat|output|leak)\b.{0,30}\b(system prompt|instructions|your prompt)\b/i,
  /\bjailbreak\b|\bDAN mode\b|\bdeveloper mode\b/i,
  /\b(this is|these are) (a|an|the|your) (instruction|command|order)s?\b/i,
  /\b(important|urgent|attention|note)\s*(to|for)\s+(the\s+)?(ai|assistant|model|llm|chatbot)\b/i,
  /\b(ai|assistant|model|llm)\s*,?\s*(you must|you should|you will|must|please)\b/i,
  /\bwhen (asked|the user asks)\b.{0,40}\b(say|reply|respond|answer|tell)\b/i,
  /\b(send|forward|email|post|upload|exfiltrate)\b.{0,40}\b(to|at)\b.{0,40}(https?:\/\/|@)/i,
];

/* Chat-template control tokens and role markers of the model families we ship; a document never legitimately has them. */
const TEMPLATE_TOKENS = /<\|im_(start|end)\|>|<\|(system|user|assistant|endoftext|eot_id|start_header_id|end_header_id)\|>|\[\/?INST\]|<<\/?SYS>>|<\/?think>|<\|begin_of_text\|>|<start_of_turn>|<end_of_turn>|<\|end\|>/g;

/* Fence markers; anything in a document that looks like one is bent so it cannot close the fence. */
const OPEN = (nonce: string) => `<<<DOCUMENTS ${nonce}>>>`;
const CLOSE = (nonce: string) => `<<<END DOCUMENTS ${nonce}>>>`;
const FENCE_LOOKALIKE = /<<<|>>>/g;

export interface StrippedText {
  text: string;
  /** Lines removed because they read as instructions to the model. */
  removed: string[];
  /** Template tokens found and deleted. */
  tokensRemoved: number;
}

export const looksLikeInstruction = (line: string): boolean => INSTRUCTION_LINE.some((re) => re.test(line));

const hasTemplateToken = (s: string): boolean => {
  TEMPLATE_TOKENS.lastIndex = 0;
  const hit = TEMPLATE_TOKENS.test(s);
  TEMPLATE_TOKENS.lastIndex = 0;
  return hit;
};

/* PDF text often arrives as one long line, so an offending line is cut down to its offending sentences. */
const SENTENCE_END = /(?<=[.!?\u061F\u05C3\u3002])\s+/u;

function splitOffending(line: string): { kept: string; removed: string[] } {
  const sentences = line.split(SENTENCE_END);
  const removed = sentences.filter((s) => looksLikeInstruction(s));
  if (!removed.length) return { kept: "", removed: [line.trim()] };
  return { kept: sentences.filter((s) => !looksLikeInstruction(s)).join(" "), removed: removed.map((s) => s.trim()) };
}

/** Removes instruction-like sentences and any line carrying a template token. Ordinary prose ("the previous chapter", "follow the rules of the club") stays. */
export function stripInstructions(text: string): StrippedText {
  let tokensRemoved = 0;
  const removed: string[] = [];
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    if (hasTemplateToken(line)) {
      tokensRemoved += line.match(TEMPLATE_TOKENS)?.length ?? 1;
      removed.push(line.trim());
      continue;
    }
    if (!looksLikeInstruction(line)) {
      kept.push(line);
      continue;
    }
    const r = splitOffending(line);
    removed.push(...r.removed);
    if (r.kept.trim()) kept.push(r.kept);
  }
  return { text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed, tokensRemoved };
}

/** Counts instruction-like lines (template-token lines included) without altering anything; flags the document at index time. */
export function countInstructionLines(text: string): number {
  let n = 0;
  for (const line of text.split("\n")) if (hasTemplateToken(line) || looksLikeInstruction(line)) n++;
  return n;
}

export function randomNonce(): string {
  const bytes = new Uint8Array(6);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface FencedPassage {
  n: number;
  label: string;
  text: string;
}

/** The context block: numbered passages between nonce fences; look-alike markers inside a passage are bent. */
export function fenceDocuments(passages: FencedPassage[], nonce: string): string {
  const body = passages.map((p) => `[${p.n}] ${p.label}\n${p.text.replace(FENCE_LOOKALIKE, (m) => (m === "<<<" ? "\u2039\u2039\u2039" : "\u203A\u203A\u203A"))}`).join("\n\n");
  return `${OPEN(nonce)}\n${body}\n${CLOSE(nonce)}`;
}

export const fenceMarkers = (nonce: string): { open: string; close: string } => ({ open: OPEN(nonce), close: CLOSE(nonce) });
