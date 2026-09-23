/**
 * What a chat turn does about attached documents, decided before anything reaches the model (§7.3 "answer only from my documents").
 *
 * `retrieve` alone may search: with nothing indexed attached to this chat, `DocumentLibrary.ask` would widen the
 * search to the whole library, which is not what the user attached (QA F34).
 */
export type DocsTurn = { kind: "retrieve" } | { kind: "wait" } | { kind: "refuse"; messageKey: RefusalKey } | { kind: "model" };

export type RefusalKey = "documents.notFound" | "documents.noneAttached" | "documents.notRead" | "documents.needsOcr" | "documents.needsIndexModel";

/** Why the attached documents have nothing to search although none of them is still being read. */
export type AttachmentBlock = "needs-ocr" | "no-embedder" | null;

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
}

const refusalFor = (blocked: AttachmentBlock): RefusalKey => (blocked === "needs-ocr" ? "documents.needsOcr" : blocked === "no-embedder" ? "documents.needsIndexModel" : "documents.notRead");

/**
 * Strict mode with nothing to search must say so; it may never fall through to a free answer from the model's weights.
 *
 * A file the user attached is never silently dropped either (QA F125/F126): while it is still being read the turn waits,
 * and once reading is over with nothing to search the turn says why. Answering from the weights with an attachment on
 * screen produced both "I don't see an attached photo" and an invented access code on the 6T.
 */
export function planDocsTurn({ strict, hasAttachment, hasIndex, indexing = false, blocked = null }: DocsTurnInput): DocsTurn {
  if (hasAttachment && indexing) return { kind: "wait" };
  if (hasIndex) return { kind: "retrieve" };
  if (hasAttachment) return { kind: "refuse", messageKey: refusalFor(blocked) };
  if (!strict) return { kind: "model" };
  return { kind: "refuse", messageKey: "documents.noneAttached" };
}
