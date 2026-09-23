import type { DocumentRecord, IndexProgress } from "@inborn/core";

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** What a library row says about one document, and how loud it is. The colour is the caller's, the sentence is not. */
export interface DocumentState {
  text: string;
  tone: "progress" | "waiting" | "ready" | "attention" | "paused" | "error";
}

/**
 * The library's state line (spec S40). The attach sheet used to collapse every state that is not "indexed" into
 * "Not indexed yet", so a scan with no text layer looked like a file still being read, stayed attached, and the model
 * answered about it from nothing (QA F160).
 */
export function documentState(doc: DocumentRecord, t: Translate, device: string, progress?: IndexProgress): DocumentState {
  switch (doc.status) {
    case "indexing": {
      const pages = Math.max(1, progress?.pages ?? doc.pages);
      const page = progress?.page ?? doc.indexedPages;
      return { text: t("documents.state.indexing", { percent: Math.floor((100 * page) / pages), page, pages }), tone: "progress" };
    }
    case "queued":
      return { text: t("documents.state.queued"), tone: "waiting" };
    case "indexed":
      return { text: t("documents.state.indexed", { count: doc.chunkCount }), tone: "ready" };
    case "needs-ocr":
      return { text: t("documents.state.needsOcr", { device }), tone: "attention" };
    case "cancelled":
      return { text: t("documents.state.cancelled", { page: doc.indexedPages, pages: doc.pages }), tone: "paused" };
    case "empty":
      return { text: t(doc.bytes === 0 ? "documents.error.empty" : "documents.state.empty"), tone: "error" };
    case "failed":
      return { text: t(`documents.error.${doc.error ?? "corrupt"}`, { defaultValue: t("documents.state.failed", { error: doc.error ?? "" }) }), tone: "error" };
  }
}
