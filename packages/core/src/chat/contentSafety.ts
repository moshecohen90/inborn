/**
 * Family-safe mode (§11.1 Guideline 1.2 "filtering", §11.2 AI-content (a)(b)(c), §11.5 item 8).
 *
 * Three honest, cheap parts, all on the device and none of them a classifier:
 *  1. a clause added to the system prompt, so the model is asked not to produce the content in the first place;
 *  2. a phrase check over the user's turn, so an explicit request is refused without spending a generation;
 *  3. the same check over the answer, so an answer that got there anyway is replaced before it is stored.
 *
 * It reduces this content; it does not eliminate it. Every published claim must say exactly that
 * (`docs/legal/privacy-policy.md`, `terms.md`, `app-privacy-details.md`).
 *
 * Why no model: the spec's own candidate is ShieldGemma, which carries the Gemma terms and would need an
 * acceptance screen and a second model download per language; an Apache-2.0 classifier is a week of work and
 * another 300 MB on a phone whose whole promise is one model. Recorded for Moshe in README "Decisions for Moshe".
 */

/** Added to `SAFETY_BASELINE` while family-safe mode is on; the crisis wording in the baseline stays either way. */
export const FAMILY_SAFE_CLAUSE =
  "Family-safe mode is on. Do not write sexually explicit content, graphic descriptions of violence or gore, or instructions for self-harm, suicide, weapons or explosives. If a request asks for that, say briefly that you will not and offer something else.";

/** What the check caught. The UI names none of them to the user; the refusal is one sentence either way. */
export type SafetyCategory = "sexual" | "violence" | "selfHarm";

export interface SafetyVerdict {
  flagged: boolean;
  category?: SafetyCategory;
  /** The matched text, for the local ledger row and for tests. Never leaves the device. */
  match?: string;
}

const NOT_FLAGGED: SafetyVerdict = { flagged: false };

/**
 * Explicit phrases only, per shipped UI language (en, de, es, fr, ja, ko, pt, zh-Hant), plus the ones an answer
 * in Hebrew would use. Every list is checked whatever the UI locale is: the model answers in the user's language,
 * not the app's. Patterns are deliberately phrase-shaped, because single words ("violence", "sex", "suicide")
 * appear in ordinary history, medicine and news answers and flagging those would make the mode useless.
 */
const PATTERNS: Record<SafetyCategory, readonly RegExp[]> = {
  sexual: [
    /\b(?:blow|hand|rim) ?jobs?\b/i,
    /\bdeep ?throat(?:ing|ed)?\b/i,
    /\b(?:cunnilingus|fellatio|creampies?|cum ?shots?|gang ?bangs?|bukkake)\b/i,
    /\b(?:erect|throbbing|rock[- ]hard|stiff) (?:cock|dick|penis|member|shaft)\b/i,
    /\b(?:cock|dick|penis) (?:in|inside|into) (?:her|his|my|your)\b/i,
    /\b(?:suck(?:ed|ing)?|lick(?:ed|ing)?) (?:his|her|my|your) (?:cock|dick|penis|pussy|clit\w*)\b/i,
    /\bmoan(?:ed|ing|s)?(?: \w+)? (?:with|in) (?:pleasure|ecstasy)\b/i,
    /\b(?:muschi|fotze)\b/i,
    /* German declines the adjective ("steifer/steifen/steifem Schwanz"), so the stem carries the match, not the nominative form. */
    /\b(?:steif|hart)\w* (?:schwanz|penis)\b/i,
    /\bmamada\b/i,
    /\bpolla (?:dura|erecta)\b/i,
    /\bgemidos? de placer\b/i,
    /\b(?:fellation|branlette)\b/i,
    /\bg[ée]mi\w+ de plaisir\b/i,
    /\b(?:boquete|punheta|gozada)\b/i,
    /\bpau (?:duro|ereto)\b/i,
    /\bgemid\w+ de prazer\b/i,
    /(?:フェラチオ|中出し|アナルセックス|喘ぎ声)/,
    /(?:펠라치오|성기를 삽입|자위 행위를)/,
    /(?:口交|肛交|勃起的陰莖|淫叫)/,
    /(?:מין אוראלי|איבר מינו הזקור)/,
  ],
  violence: [
    /* `\b` alone matched "bomb-proof argument"; the hyphen has to end the word for a compound to escape. */
    /\bhow to (?:make|build|assemble) (?:a |an )?(?:pipe )?(?:bomb|explosive|napalm|nerve agent|molotov)s?(?![\w-])/i,
    /\b(?:disembowel(?:ed|ing|s)?|decapitat\w+|dismember\w+) (?:him|her|them|the victim)\b/i,
    /\b(?:blood|entrails|intestines) (?:spurt|gush|spill)\w*\b/i,
    /\bwie (?:baue|mache) ich eine bombe\b/i,
    /\bc[oó]mo (?:hacer|fabricar|construir) una bomba\b/i,
    /\bcomment (?:fabriquer|faire) une bombe\b/i,
    /\bcomo (?:fazer|fabricar|construir) uma bomba\b/i,
    /(?:爆弾の作り方|臓物が飛び散)/,
    /(?:폭탄 만드는 법|폭탄 제조법)/,
    /(?:製造炸彈的方法|炸彈製作方法)/,
    /(?:איך מכינים פצצה)/,
  ],
  selfHarm: [
    /\bhow (?:to|do i|can i|should i) (?:kill|hang|suffocate|poison) (?:myself|yourself)\b/i,
    /\b(?:best|easiest|painless|quickest|surest) way to (?:kill|end) (?:yourself|myself|your life|my life)\b/i,
    /\b(?:lethal|fatal|deadly) dose of\b/i,
    /\bhow to (?:overdose|tie a noose|slit (?:your|my) wrists)\b/i,
    /\bwie (?:bringe|bring) ich mich um\b/i,
    /\bt[öo]dliche dosis\b/i,
    /\bc[oó]mo (?:suicidarme|matarme|me suicido)\b/i,
    /\bdosis (?:letal|mortal) de\b/i,
    /\bcomment (?:me suicider|me tuer)\b/i,
    /\bdose (?:l[ée]tale|mortelle) de\b/i,
    /\bcomo (?:me matar|me suicidar)\b/i,
    /\bdose (?:letal|mortal) de\b/i,
    /(?:自殺の方法|楽に死ぬ方法|致死量)/,
    /(?:자살하는 방법|자살 방법|치사량)/,
    /(?:自殺方法|自殺的方法|致死劑量)/,
    /(?:איך להתאבד|מינון קטלני של)/,
  ],
};

/* Self-harm first: it is the category whose refusal the crisis card accompanies, so it must win a text that trips two. */
const ORDER: SafetyCategory[] = ["selfHarm", "sexual", "violence"];

/**
 * The check the chat runs over a user turn and again over the finished answer. Pure, synchronous, no model,
 * no network; a few dozen regular expressions over the text.
 */
export function checkOutput(text: string): SafetyVerdict {
  if (!text) return NOT_FLAGGED;
  for (const category of ORDER) {
    for (const re of PATTERNS[category]!) {
      const hit = re.exec(text);
      if (hit) return { flagged: true, category, match: hit[0] };
    }
  }
  return NOT_FLAGGED;
}

/** The one call every surface makes, so "is the mode on" is answered in one place instead of at each call site. */
export function screenText(text: string, familySafe: boolean): SafetyVerdict {
  return familySafe ? checkOutput(text) : NOT_FLAGGED;
}

/** The system prompt's safety block: the shipped baseline, plus the family-safe clause while the mode is on. */
export function safetyBaseline(baseline: string, familySafe: boolean): string {
  return familySafe ? `${baseline} ${FAMILY_SAFE_CLAUSE}` : baseline;
}
