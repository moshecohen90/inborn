import { requireOptionalNativeModule } from "expo";

interface NativeShareTarget {
  consumePending(): Record<string, unknown> | null;
  finishProcessText(text: string | null): boolean;
  hasProcessText(): boolean;
  contentMeta(uri: string): { name?: string | null; mimeType?: string | null } | null;
  addListener(event: "onShare", listener: (payload: Record<string, unknown>) => void): { remove(): void };
}

/** Android only (spec §7.7): ACTION_SEND into the app and ACTION_PROCESS_TEXT "Ask Inborn". iOS uses the share extension; the web has nothing. */
const native = requireOptionalNativeModule<NativeShareTarget>("ShareTarget");

export const hasShareTarget = (): boolean => native !== null;

export const consumePendingShare = (): Record<string, unknown> | null => native?.consumePending() ?? null;

export function onShare(listener: (payload: Record<string, unknown>) => void): () => void {
  const sub = native?.addListener("onShare", listener);
  return () => sub?.remove();
}

/** "Replace" (text) sends the result back to the selecting app; null tells it the user cancelled. */
export const finishProcessText = (text: string | null): boolean => native?.finishProcessText(text) ?? false;

export const hasProcessText = (): boolean => native?.hasProcessText() ?? false;

/** Android: the display name and MIME type the provider reports for a content:// URI (the SAF picker's URI carries only an id). */
export const contentMeta = (uri: string): { name?: string | null; mimeType?: string | null } | null => (uri.startsWith("content:") ? (native?.contentMeta(uri) ?? null) : null);
