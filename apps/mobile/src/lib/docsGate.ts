/**
 * What a chat turn does about attached documents, decided before anything reaches the model (§7.3 "answer only from my documents").
 *
 * `retrieve` alone may search: with nothing indexed attached to this chat, `DocumentLibrary.ask` would widen the
 * search to the whole library, which is not what the user attached (QA F34).
 */
export type DocsTurn =
  | { kind: "retrieve" }
  | { kind: "wait" }
  | { kind: "refuse"; messageKey: "documents.notFound" | "documents.noneAttached" | "documents.notReadable" | "documents.noIndexModel" }
  | { kind: "model" };

export interface DocsTurnInput {
  /** The "Answer only from my documents" switch. */
  strict: boolean;
  /** The chat has at least one attached document, indexed or not. */
  hasAttachment: boolean;
  /** At least one attached document has passages to search. */
  hasIndex: boolean;
  /** An attached document is queued or being read right now. */
  indexing?: boolean;
  /** The index model is not installed, so nothing attached can ever be searched. */
  noIndexModel?: boolean;
}

/**
 * A file the user attached is never answered around: the turn waits for its index, or says why it cannot be read.
 * Answering from the model's weights while a file hangs off the composer is what produced "I received no document"
 * on Moshe's iPhone and 6T (QA F135); strict mode alone never guarded it, because the switch is off by default.
 */
export function planDocsTurn({ strict, hasAttachment, hasIndex, indexing = false, noIndexModel = false }: DocsTurnInput): DocsTurn {
  if (hasAttachment && indexing) return { kind: "wait" };
  if (hasIndex) return { kind: "retrieve" };
  if (!hasAttachment) return strict ? { kind: "refuse", messageKey: "documents.noneAttached" } : { kind: "model" };
  if (noIndexModel) return { kind: "refuse", messageKey: "documents.noIndexModel" };
  return { kind: "refuse", messageKey: strict ? "documents.notFound" : "documents.notReadable" };
}
