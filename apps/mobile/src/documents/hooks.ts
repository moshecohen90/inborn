import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Citation, DocumentRecord, Message, RagPrompt } from "@inborn/core";
import { useEntitlement } from "../licence";
import { peekEngine } from "../engine";
import { canCiteMarkers, getLibrary, type DocumentLibrary, type LibraryState } from "./library";

/* useSyncExternalStore needs a changing snapshot; a counter bumped per notification is enough (same trick as the vault). */
let version = 0;
let subscribed = false;
function snapshot(lib: DocumentLibrary): number {
  if (!subscribed) {
    subscribed = true;
    lib.subscribe(() => void version++);
  }
  return version;
}

export function useDocuments(): { library: DocumentLibrary; state: LibraryState; version: number } {
  const library = getLibrary();
  const subscribe = useCallback((cb: () => void) => library.subscribe(cb), [library]);
  const v = useSyncExternalStore(subscribe, () => snapshot(library), () => 0);
  const state = useMemo(() => library.state(), [library, v]);
  return { library, state, version: v };
}

/** What a chat carries about documents: the attached ids and the strict switch (the `documents` field of the chat's system context). */
export interface ChatDocumentsContext {
  docIds: string[];
  strict: boolean;
}

export interface DocumentContext {
  /** Attached documents (empty when the chat has none). */
  documents: DocumentRecord[];
  strict: boolean;
  setStrict: (v: boolean) => void;
  attach: (docId: string) => void;
  detach: (docId: string) => void;
  /** True when at least one attached document has an index to search. */
  ready: boolean;
  /** Retrieval + fenced prompt for the next user turn; `prompt.noAnswer` means answer with `documents.notFound` and skip the model. */
  buildPrompt: (question: string, history: Message[], nCtx: number, systemPrompt?: string) => Promise<{ prompt: RagPrompt; retrieveMs: number }>;
  /** Chips to show under a finished answer. */
  citationsFor: (answer: string, citations: Citation[]) => { shown: Citation[]; cited: boolean };
  /** The `documents` field to keep on the chat's system context. */
  context: ChatDocumentsContext;
}

/**
 * For the Chat screen (owned by another stream): everything it needs to add documents to a turn.
 * A chat without attachments gets `documents: []` and `ready: false`, so the plain path is untouched.
 */
export function useDocumentContext(chatId: string | null): DocumentContext {
  const { library, state } = useDocuments();
  const { can } = useEntitlement();
  /* §7.3 Pro. Masked here rather than at the switch so a lapsed licence stops changing answers, not just the UI. */
  const strict = state.strict && can("strictDocuments");
  const key = chatId ?? "";
  const documents = useMemo(() => (chatId ? library.attachedTo(chatId) : []), [library, chatId, state]);
  const docIds = useMemo(() => documents.map((d) => d.id), [documents]);
  const ready = documents.some((d) => d.chunkCount > 0);
  return {
    documents,
    strict,
    setStrict: (v) => library.setStrict(v),
    attach: (docId) => library.attach(key, docId),
    detach: (docId) => library.detach(key, docId),
    ready,
    buildPrompt: (question, history, nCtx, systemPrompt) => library.ask(question, { docIds, history, nCtx, systemPrompt, strict, citeMarkers: canCiteMarkers(peekEngine()?.model.id) }),
    citationsFor: (answer, citations) => library.citationsFor(answer, citations),
    context: { docIds, strict },
  };
}
