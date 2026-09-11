import { useEffect, useRef } from "react";
import { useShareIntent } from "expo-share-intent";
import { parseSharePayload, type SharePayload } from "@inborn/core";

/** iOS (spec §7.7, S43): the share extension stores the item in the App Group and opens `inborn://dataUrl=…`; expo-share-intent reads it back here. */
export function useShareTarget(onSharePayload: (payload: SharePayload) => void): void {
  const handler = useRef(onSharePayload);
  handler.current = onSharePayload;
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({ resetOnBackground: false, disabled: false, debug: false });
  useEffect(() => {
    if (!hasShareIntent) return;
    const payload = parseSharePayload(shareIntent);
    resetShareIntent();
    if (payload) handler.current(payload);
  }, [hasShareIntent, shareIntent, resetShareIntent]);
}

/* iOS has no PROCESS_TEXT: the extension cannot write back into another app. */
export const finishProcessText = (_text: string | null): boolean => false;
export const canReplaceProcessText = (): boolean => false;
