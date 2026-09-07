import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ChatMessage, DetectOptions, RedactResult } from "@inborn/core";
import { useDocuments } from "../hooks";
import { hasSession, revealing, sessionFor, setRevealing, snapshot, subscribe, touch } from "./sessions";

export interface Redaction {
  /** True once this chat redacted something; the reveal toggle appears. */
  active: boolean;
  reveal: boolean;
  setReveal: (v: boolean) => void;
  /** Detector options from the user's preferences (names list, dates switch). */
  options: DetectOptions;
  /** Replaces what was found and remembers the mapping for this chat. */
  redact: (text: string, override?: Partial<DetectOptions>) => RedactResult;
  /** A row as it should be displayed: originals back when the toggle is on. */
  display: <T extends Pick<ChatMessage, "content">>(row: T) => T;
}

/** For the Chat screen: everything the composer's Redact sheet and the reveal toggle need, keyed like documents are. */
export function useRedaction(chatKey: string): Redaction {
  const { state } = useDocuments();
  const sub = useCallback((cb: () => void) => subscribe(cb), []);
  useSyncExternalStore(sub, snapshot, () => 0);
  const session = sessionFor(chatKey);
  const reveal = revealing(chatKey);
  const options = useMemo<DetectOptions>(() => ({ names: state.redactNames, kinds: { date: state.redactDates } }), [state.redactNames, state.redactDates]);
  return {
    active: hasSession(chatKey),
    reveal,
    setReveal: (v) => setRevealing(chatKey, v),
    options,
    redact: (text, override) => {
      const r = session.redact(text, { ...options, ...override, kinds: { ...options.kinds, ...override?.kinds } });
      touch();
      return r;
    },
    display: (row) => (reveal && session.size && session.mentions(row.content) ? { ...row, content: session.reveal(row.content) } : row),
  };
}

export const useRedactionPrefs = () => {
  const { library, state } = useDocuments();
  return { names: state.redactNames, dates: state.redactDates, setNames: (n: string[]) => library.setRedactNames(n), setDates: (v: boolean) => library.setRedactDates(v) };
};
