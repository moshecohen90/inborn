import { isSearchable, type DocumentRecord, type Message } from "@inborn/core";
import { withPhotos } from "../lib/photoPrompt";
import type { AskResult } from "./library";

/** Round 128: searched for its OCR text, a picture in the library was answered blind, so it goes to the chat as a photo. */
export const imageDocuments = (docs: readonly DocumentRecord[]): DocumentRecord[] => docs.filter((d) => d.kind === "image");

export function photoTextDocs(photos: readonly string[], fromDoc: ReadonlyMap<string, string>, lookup: (id: string) => DocumentRecord | undefined): string[] {
  const ids = photos.map((p) => fromDoc.get(p)).filter((id): id is string => !!id);
  return [...new Set(ids)].filter((id) => {
    const d = lookup(id);
    return !!d && isSearchable(d);
  });
}

/** F136's shape, used only when an OCR passage bears on the question: otherwise the RAG rules would open with "Your documents don't mention this". */
export async function withPhotoText(messages: Message[], photos: readonly string[] | undefined, docIds: readonly string[], ask: (docIds: string[]) => Promise<AskResult>): Promise<{ messages: Message[]; rag: AskResult | null }> {
  if (!docIds.length) return { messages, rag: null };
  const rag = await ask([...docIds]);
  if (!rag.prompt.used.length) return { messages, rag: null };
  return { messages: withPhotos(rag.prompt.messages, photos), rag };
}
