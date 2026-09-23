import { useEffect, useRef } from "react";
import { SHARE_TEXT_MAX_CHARS, type SharePayload } from "@inborn/core";

/**
 * Web: there is no OS share target (spec §7.7 is a phone feature). What the browser does have is the marketing
 * site's composer, which hands the first message over in `?q=` (spec §13.4). It arrives as the same seed a shared
 * text would, so it survives onboarding and lands in the first chat.
 */
export function useShareTarget(onShare: (payload: SharePayload) => void): void {
  /* The caller passes a fresh closure every render; the URL is read once per load, not once per render. */
  const handler = useRef(onShare);
  handler.current = onShare;
  const read = useRef(false);
  useEffect(() => {
    if (read.current || typeof window === "undefined") return;
    read.current = true;
    const text = readSeedParam(window.location.search);
    if (!text) return;
    /* The text is cleared from the address bar before it is used: a reload must not re-seed a chat the user has moved on from. */
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    handler.current({ kind: "text", text });
  }, []);
}

/** `?q=` from the site's hero composer, trimmed and capped like any other shared text. Empty or absent gives null. */
export function readSeedParam(search: string): string | null {
  try {
    const text = new URLSearchParams(search).get("q")?.trim();
    return text ? text.slice(0, SHARE_TEXT_MAX_CHARS) : null;
  } catch {
    /* A hand-edited address must not take the app down before the chat is on screen. */
    return null;
  }
}

export const finishProcessText = (_text: string | null): boolean => false;
export const canReplaceProcessText = (): boolean => false;
