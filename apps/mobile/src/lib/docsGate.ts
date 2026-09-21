/**
 * What a chat turn does about attached documents, decided before anything reaches the model (§7.3 "answer only from my documents").
 *
 * `retrieve` alone may search: with nothing indexed attached to this chat, `DocumentLibrary.ask` would widen the
 * search to the whole library, which is not what the user attached (QA F34).
 */
export type DocsTurn = { kind: "retrieve" } | { kind: "refuse"; messageKey: "documents.notFound" | "documents.noneAttached" } | { kind: "model" };

export interface DocsTurnInput {
  /** The "Answer only from my documents" switch. */
  strict: boolean;
  /** The chat has at least one attached document, indexed or not. */
  hasAttachment: boolean;
  /** At least one attached document has passages to search. */
  hasIndex: boolean;
}

/** Strict mode with nothing to search must say so; it may never fall through to a free answer from the model's weights. */
export function planDocsTurn({ strict, hasAttachment, hasIndex }: DocsTurnInput): DocsTurn {
  if (hasIndex) return { kind: "retrieve" };
  if (!strict) return { kind: "model" };
  return { kind: "refuse", messageKey: hasAttachment ? "documents.notFound" : "documents.noneAttached" };
}
