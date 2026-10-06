import { plainChatKind, type FileSection, type NoPassageOpeners, type WholeFilePlan } from "@inborn/core";

/**
 * What a chat turn does about attached documents, decided before anything reaches the model (§7.3 "answer only from my documents").
 *
 * `retrieve` alone may search: with nothing indexed attached to this chat, `DocumentLibrary.ask` would widen the
 * search to the whole library, which is not what the user attached (QA F34).
 */
export type DocsTurn = { kind: "retrieve" } | { kind: "wait" } | { kind: "refuse"; messageKey: RefusalKey } | { kind: "model" } | { kind: "page" };

export type RefusalKey = "documents.notFound" | "documents.noneAttached" | "documents.notRead" | "documents.searchFailed" | "documents.needsOcr" | "documents.needsIndexModel" | "documents.photoNotText" | "documents.noText";

/** Why the attached documents have nothing to search although none of them is still being read. */
export type AttachmentBlock = "needs-ocr" | "no-embedder" | "image" | "no-text" | null;

export interface DocsTurnInput {
  /** The "Answer only from my documents" switch. */
  strict: boolean;
  /** The chat has at least one attached document, indexed or not. */
  hasAttachment: boolean;
  /** At least one attached document has passages to search. */
  hasIndex: boolean;
  /** At least one attached document is queued or still being read. */
  indexing?: boolean;
  /** Set once nothing is being read any more and there is still no index. */
  blocked?: AttachmentBlock;
  /** The model sees a page picture of an attached file in this conversation. */
  seesPage?: boolean;
  /** The turn is about the conversation, not the files (`isPlainChatTurn`): plain chat, nothing to search. */
  smallTalk?: boolean;
}

/* A picture attached as a file is read for its text, and a photo of a door has none: OCR on it is a dead end, the Photo button is not. */
const refusalFor = (blocked: AttachmentBlock): RefusalKey =>
  blocked === "image"
    ? "documents.photoNotText"
    : blocked === "needs-ocr"
      ? "documents.needsOcr"
      : blocked === "no-embedder"
        ? "documents.needsIndexModel"
        : /* Read to the end and it carried no text: an unreadable scan, which a model will happily improvise around (QA F302). */
          blocked === "no-text"
          ? "documents.noText"
          : "documents.notRead";

/**
 * Strict mode with nothing to search must say so; it may never fall through to a free answer from the model's weights.
 *
 * A file the user attached is never silently dropped either (QA F125/F126): while it is still being read the turn waits,
 * and once reading is over with nothing to search the turn says why. Answering from the weights with an attachment on
 * screen produced both "I don't see an attached photo" and an invented access code on the 6T.
 */
/**
 * Whether the chat says "nothing in your documents matched this question. Answered without them." (QA F161).
 *
 * Never on Continue: that turn resumes a partial answer which may have cited the documents in its first half, and it
 * is forced past the gate with no retrieval of its own, so it has no passage count to report.
 */
/**
 * Documents → Ask takes the chat's door (F416, Moshe 27.9): only strict mode's no-answer skips the model. With no
 * passage kept outside strict mode the question goes on as a general one, under the chat's "Answered without them".
 */
export function askSheetRoute({ noAnswer }: { noAnswer: boolean }): "not-found" | "answer" {
  return noAnswer ? "not-found" : "answer";
}

/** Round 134D: the sheet keeps no history, so a thanks or a follow-up ("And now") gets one plain line instead of a search. */
export const sheetPlainLine = (t: (key: string) => string, text: string): string | null => {
  const kind = plainChatKind(text);
  return kind === "acknowledgement" ? t("documents.ask.thanks") : kind === "follow-up" ? t("documents.ask.oneQuestion") : null;
};

export function saysNoneMatched({ continuing, attachedCount, usedPassages, smallTalk = false }: { continuing: boolean; attachedCount: number; usedPassages: number; smallTalk?: boolean }): boolean {
  return !continuing && !smallTalk && attachedCount > 0 && usedPassages === 0;
}

/* "The report states…" with no passage in the prompt can only be invented (round 130); a denial ("does not mention") is not a claim. */
const FILE_CLAIM = /\b(?:the|this|that|your|my)\s+(?:provided\s+|attached\s+)?(?:report|document|file|handbook|manual|pdf|page|text|passage|guide)s?\s+(?:clearly\s+|also\s+|only\s+|do\s+|does\s+)?(?:states|says|indicates|outlines|specifies|describes|explains|notes|lists|shows|recommends|contains|provides|mentions|mention|highlights|suggests|was\s+(?:written|authored|published))\b(?!\s+(?:no|nothing|none)\b)/i;

const OPENS_WITH_DENIAL = /^[^.!?]*\b(?:don't|do not|doesn't|does not)\s+mention\b/i;

/** An answer that tells what the attached files say although no passage of them reached the model. English only. */
export const claimsFileContent = (answer: string): boolean => FILE_CLAIM.test(answer) && !OPENS_WITH_DENIAL.test(answer);

/** The sentences a documents answer with no passage opens with, in the UI language: a quoted English one pulled other languages into English (F449). */
export const noPassageOpeners = (t: (key: string) => string): NoPassageOpeners => ({ nothingRelevant: t("documents.opener.nothingRelevant"), nothingFits: t("documents.opener.nothingFits"), thinPage: t("documents.opener.thinPage") });

/** The line under a summary that says how much of the file it read (round 132): all of it, or the first pages of a longer one. */
export const summaryScope = (t: (key: string, values?: Record<string, unknown>) => string, plan: Pick<WholeFilePlan, "pagesRead" | "pagesTotal">, smallModel?: { current: string; better: string }): string =>
  (plan.pagesRead >= plan.pagesTotal ? t("documents.summary.whole", { count: plan.pagesTotal }) : t("documents.summary.cut", { read: plan.pagesRead, count: plan.pagesTotal })) +
  /* Round 132: Instant's summaries of long files mixed up details in 1 of 2 graded answers; it says so under the answer. */
  (smallModel ? ` ${t("documents.summary.smallModel", smallModel)}` : "");

/** "Reading page 3 of 9…", or the span a section covers, while a summary reads the file. */
export const readingPagesLine = (t: (key: string, values?: Record<string, unknown>) => string, section: Pick<FileSection, "from" | "to">, of: number): string =>
  section.from === section.to ? t("documents.summary.readingPage", { page: section.from, count: of }) : t("documents.summary.readingPages", { from: section.from, to: section.to, count: of });

/** The Ask sheet's timing line is §7.8 "detailed statistics", the Pro row the chat's ledger already gates. */
export function askStatsLine(stats: string | null, detailed: boolean): string | null {
  return detailed ? stats : null;
}

export function planDocsTurn({ strict, hasAttachment, hasIndex, indexing = false, blocked = null, seesPage = false, smallTalk = false }: DocsTurnInput): DocsTurn {
  if (smallTalk) return { kind: "model" };
  if (hasAttachment && indexing) return { kind: "wait" };
  if (hasIndex) return { kind: "retrieve" };
  /* Round 132: a scan with no text layer is answered from its page picture; the OCR refusal is for a model that cannot see it. */
  if (hasAttachment && seesPage) return { kind: "page" };
  if (hasAttachment) return { kind: "refuse", messageKey: refusalFor(blocked) };
  if (!strict) return { kind: "model" };
  return { kind: "refuse", messageKey: "documents.noneAttached" };
}

export interface IndexHoldInput {
  /** Documents attached to this chat. */
  attached: number;
  /** The library's index model: `loading` while it is still being looked for at launch. */
  embedder: "ready" | "missing" | "loading" | "failed";
  /** The user chose, on the hold card, to go on with the word search for this chat. */
  wordsAccepted: boolean;
  /** What the turn sends already holds every attached file whole (`coversAttachments`). */
  coveredWhole?: boolean;
  /** The turn is about the conversation, not the files (`isPlainChatTurn`). */
  smallTalk?: boolean;
}

/**
 * Round 93: a file with no index model behind it is searched by its words only, which finds a fact the question names
 * but misses one it paraphrases. Send stops once so the user decides: fetch the index model, or go on with words.
 */
export function planIndexHold({ attached, embedder, wordsAccepted, coveredWhole = false, smallTalk = false }: IndexHoldInput): "hold" | "send" {
  if (attached === 0 || wordsAccepted || coveredWhole || smallTalk) return "send";
  return embedder === "missing" || embedder === "failed" ? "hold" : "send";
}

/** How long a turn held for the index model waits for its files to be indexed with it before it goes out anyway. */
export const HELD_INDEX_WAIT_MS = 120_000;

export interface HeldReleaseDeps {
  /** Attached documents not yet indexed with the index model that just arrived. */
  pending: () => number;
  subscribe: (listener: () => void) => () => void;
  /** The "Reading your document before answering…" line; 0 hides it. */
  show: (count: number) => void;
  send: () => Promise<void>;
  timeoutMs?: number;
}

/**
 * Round 130: the turn held for the index model went out the moment the model landed, while its file was still being
 * rebuilt, and answered "The report states…" under "Nothing in your documents matched". It now waits for the index,
 * on screen, and a rebuild that never finishes still releases it to the existing honest notices.
 */
export async function releaseWhenIndexed(d: HeldReleaseDeps): Promise<"indexed" | "timeout"> {
  let outcome: "indexed" | "timeout" = "indexed";
  if (d.pending() > 0) {
    d.show(d.pending());
    outcome = await new Promise((resolve) => {
      const timer = setTimeout(() => finish("timeout"), d.timeoutMs ?? HELD_INDEX_WAIT_MS);
      const off = d.subscribe(() => {
        const left = d.pending();
        if (left === 0) finish("indexed");
        else d.show(left);
      });
      function finish(o: "indexed" | "timeout") {
        clearTimeout(timer);
        off();
        resolve(o);
      }
    });
    d.show(0);
  }
  await d.send();
  return outcome;
}
