import { useEffect, useRef } from "react";
import { parseSharePayload, type SharePayload } from "@inborn/core";
import { consumePendingShare, finishProcessText as nativeFinish, hasProcessText, onShare } from "../../modules/share-target";

/** Android (spec §7.7): the item that launched the app, then every ACTION_SEND / "Ask Inborn" while it runs. */
export function useShareTarget(onSharePayload: (payload: SharePayload) => void): void {
  const handler = useRef(onSharePayload);
  handler.current = onSharePayload;
  useEffect(() => {
    const pending = parseSharePayload(consumePendingShare());
    if (pending) handler.current(pending);
    return onShare((raw) => {
      const payload = parseSharePayload(raw);
      if (payload) handler.current(payload);
    });
  }, []);
}

export const finishProcessText = (text: string | null): boolean => nativeFinish(text);
export const canReplaceProcessText = (): boolean => hasProcessText();
